import Tesseract from "tesseract.js";

function getCleanLines(raw: string): string[] {
    raw = raw.replace(/\\\\r\\\\n/g, '\n'); // double-escaped
    raw = raw.replace(/\\r\\n/g, '\n'); // single-escaped
    raw = raw.replace(/\\n/g, '\n');
    raw = raw.replace(/\r\n/g, '\n'); // real CRLF
    raw = raw.replace(/\r/g, '\n'); // lone CR
    raw = raw.replace(/\\u0001/g, ''); // literal string
    raw = raw.replace(/\u0001/g, ''); // actual char
    raw = raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, ''); // other controls

    return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

// 2) Split a line on the first “:”—returns [key, value] or null if no colon
function splitKV(line: string): [string, string] | null {
    const idx = line.indexOf(':');
    if (idx === -1) return null;
    return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}

// 3) Convert something like
//     "หมายเลขบริการ (Service No.)"
//    into just "serviceNo"
function extractEnglishKey(rawKey: string): string{
    // Look for the parentheses. E.g. "หมายเลขบริการ (Service No.)"
    //          match[1] === "Service No."
    const match = rawKey.match(/\(([^)]+)\)/);
    if (match && match[1]) {
        // Lowercase + remove spaces, slashes, parentheses → camelCase style
        // e.g. "Service No." → "serviceNo"
        let englishPart = match[1]
            .replace(/\./g, '') // drop periods
            .replace(/[\s\-\/]/g, ' ') // normalize hyphens/slashes to spaces
            .trim()
            .split(' ')
            .map((w, i) => {
                if (i === 0) return w.toLowerCase();
                return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            })
            .join('');
        return englishPart;
    }
    // If there was no parentheses, fallback to stripping non‐ASCII, then lowercase
    return rawKey
        .replace(/[^\x00-\x7F]/g, '') // drop non‐ASCII (Thai) characters
        .replace(/[\s\-\/\(\)\.]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

// 4) Given an array of lines that look like “Key: Value”,
//    collect them into { [englishKey]: value }
function collectKV(lines: string[]): Record<string, string> {
    return lines.reduce((acc: Record<string, string>, line: string) => {
        const kv = splitKV(line);
        if (kv) {
            const rawKey = kv[0];
            const rawVal = kv[1];
            const engKey = extractEnglishKey(rawKey);
            acc[engKey] = rawVal;
        }
        return acc;
    }, {});
}

export function buildBillObject(raw: string): Record<string, any> {
    const lines = getCleanLines(raw);

    // ----------------------------
    // 1) Header KV (the five known fields)
    //    Look for lines that start with those five Thai keywords:
    //      หมายเลขบริการ, รหัสลูกค้า, เลขที่ใบแจ้งค่าใช้บริการ, วันที่ออกใบแจ้งค่าใช้บริการ, รหัสกลุ่มลูกค้า
    //    Then collect KV pairs and rename keys to English.
    // ----------------------------
    const headerLines = lines.filter((l) =>
        /^(หมายเลขบริการ|รหัสลูกค้า|เลขที่ใบแจ้งค่าใช้บริการ|วันที่ออกใบแจ้งค่าใช้บริการ|รหัสกลุ่มลูกค้า)/.test(l)
    );
    const headerKV_Raw = collectKV(headerLines);
    // Example headerKV_Raw might be:
    //   {
    //     serviceNo: "021236000",
    //     accountNo: "104532043063 (BIZ)",
    //     invoiceNo: "0000898488223",
    //     issueDate: "02/03/2568",
    //     groupNo: "F050398"
    //   }

    // ----------------------------
    // 2) Address block
    //    Find the index of the line "ชื่อและที่อยู่สำาหรับจัดส่งเอกสาร"
    //    Then grab the next 5 lines as the “address.” Join them with spaces.
    //    We will store it under “nameAndAddress” (all‐English).
    // ----------------------------
    const addrStart = lines.findIndex((l) => l.includes('ชื่อและที่อยู่สำาหรับจัดส่งเอกสาร'));
    const addressLines = addrStart > -1 ? lines.slice(addrStart + 1, addrStart + 6) : [];
    const address = addressLines.join(' ').trim();

    // ----------------------------
    // 3) Bill cycle & balances
    //    e.g. “รอบค่าใช้บริการ (Bill Cycle) : 26/01/2568 - 25/02/2568 (ประจำาเดือนกุมภาพันธ์ 2568)”
    //    We will extract the date-range after the colon as `billCycle`.
    //    Then look for the “balances” block—six numeric fields plus a date.
    //    We purposely name them in English:
    //      previousBalance, paidAmount, adjustment, currentCharge, totalOutstandingBalance, currentDueDate
    // ----------------------------
    const billCycleLine = lines.find((l) => l.startsWith('รอบค่าใช้บริการ')) || '';
    const billCycleMatch = billCycleLine.match(/: ([\d\/]+ - [\d\/]+)/);
    const billCycle = billCycleMatch ? billCycleMatch[1] : '';

    const balanceStartIdx = lines.findIndex((l) => l.includes('ยอดยกมา'));
    let balanceValues: string[] = [];
    if (balanceStartIdx > -1) {
        for (let i = balanceStartIdx + 1; i <= balanceStartIdx + 15 && i < lines.length; i++) {
            const tokens = lines[i].trim().split(/\s+/);
            if (
                tokens.length === 6 &&
                tokens.slice(0, 5).every((t) => /^[\d,]+\.\d{2}$/.test(t)) &&
                /^\d{2}\/\d{2}\/\d{2,4}$/.test(tokens[5])
            ) {
                balanceValues = tokens;
                break;
            }
        }
    }

    const balancesObj =
        balanceValues.length === 6
            ? {
                previousBalance: balanceValues[0], // ยอดยกมา (Previous Balance)
                paidAmount: balanceValues[1], // ยอดเงินที่ชำระแล้ว (Paid Amount)
                adjustment: balanceValues[2], // ยอดปรับปรุง (Adjustment)
                currentCharge: balanceValues[3], // ยอดค่าใช้บริการรอบปัจจุบัน (Current Charge)
                totalOutstandingBalance: balanceValues[4], // ยอดรวมที่ต้องชำระทั้งสิ้น (Total Outstanding Balance)
                currentDueDate: balanceValues[5], // วันครบกำาหนดชำาระรอบปัจจุบัน (Current Due Date)
            }
            : {};

    const balancesBlock = {
        billCycle,
        balances: balancesObj,
    };

    // ----------------------------
    // 4) Summary of Current Charges
    //    We look for the line that includes "สรุปค่าใช้บริการรอบปัจจุบัน"
    //    Then we parse until we hit something like "ผู้รับเงิน" or "ผ่านธนาคาร".
    //    We capture each section (e.g. "บริการ ISDN-PRI 2 เลขหมายหลัก") as a key,
    //    and its array of child‐objects having fields
    //      typeofService, serviceCharge, discount, amount
    //
    //    We will remap each section‐title (Thai) to a short English key—
    //    there are two example sections in your sample:
    //      "บริการ ISDN-PRI 2 เลขหมายหลัก"  → "ISDN_PRI"
    //      "บริการ SIP Trunk 1 Trunk"         → "SIP_Trunk"
    //
    //    (You can rename these to whatever English identifiers you want.)
    // ----------------------------
    const sumIdx = lines.findIndex((l) => l.includes('สรุปค่าใช้บริการรอบปัจจุบัน'));
    const summary: Record<string, Array<{
        typeofService: string;
        serviceCharge: string;
        discount: string;
        amount: string;
    }>> = {};
    let currentSection: string | null = null;

    if (sumIdx > -1) {
        const sectionNameMap: Record<string, string> = {
            'บริการ ISDN-PRI 2 เลขหมายหลัก': 'ISDN_PRI',
            'บริการ SIP Trunk 1 Trunk': 'SIP_Trunk',
        };

        for (let i = sumIdx + 1; i < lines.length; i++) {
            const l = lines[i].trim();
            if (!l) continue;

            if (sectionNameMap[l]) {
                currentSection = sectionNameMap[l];
                summary[currentSection] = [];
                continue;
            }

            if (/ผู้รับเงิน|ผ่านธนาคาร/.test(l)) {
                break;
            }

            const m = l.match(/^(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
            if (m && currentSection !== null) {
                summary[currentSection].push({
                    typeofService: m[1].trim(),
                    serviceCharge: m[2],
                    discount: m[3],
                    amount: m[4],
                });
            }
        }
    }

    // ----------------------------
    // 5) Bank payment section
    //    Find the line that includes "ผ่านธนาคาร" → collect next 7 lines as KV,
    //    then next 4 lines as “ref” KV, then pick up the "(Due Date)" line.
    //    We also translate each Thai+English key into English only.
    // ----------------------------
    const bankIdx = lines.findIndex((l) => l.includes('ผ่านธนาคาร'));
    const bankKV_Raw = bankIdx > -1 ? collectKV(lines.slice(bankIdx + 1, bankIdx + 8)) : {};
    // bankKV_Raw might have keys like "หมายเลขบริการ (Service No.)": "021236000", etc.
    // We want to convert those raw keys to pure‐English, e.g. { serviceNo: ..., accountNo: ..., invoiceNo: ... }
    // But `collectKV` already did that (extractEnglishKey).
    // So bankKV_Raw is already { serviceNo: "021236000", accountNo: "104532043063", invoiceNo: "0000898488223", ... }

    const refKV_Raw = bankIdx > -1 ? collectKV(lines.slice(bankIdx + 8, bankIdx + 12)) : {};
    // refKV_Raw might look like:
    //   { discount: "-1,655,171.50", serviceCode: "NTTOT", ref1: "91104532043063", ref2: "20000898488223" }

    // Find the “(Due Date)” line
    const dueLine = lines.find((l) => l.includes('(Due Date)')) || '';
    const dueDate = dueLine.includes(':') ? dueLine.split(':')[1].trim() : '';

    // ----------------------------
    // 6) Call Detail Records (CDRs)
    //    Find line containing "หมายเลข" + "เวลา ว/ด/ป" + "เรียกไป"
    //    Then parse each subsequent row into { serviceNo, time, destination, type, unit, amount }
    // ----------------------------
    const cdrIdx = lines.findIndex((l) => l.includes('หมายเลข') && l.includes('เวลา ว/ด/ป') && l.includes('เรียกไป'));

    const cdrs: Array<{
        serviceNo: string;
        time: string;
        destination: string;
        type: string;
        unit: string;
        amount: string;
    }> = [];
    if (cdrIdx > -1) {
        for (let i = cdrIdx + 1; i < lines.length; i++) {
            const row = lines[i].trim();
            if (!row) continue;

            const firstToken = row.split(/\s+/)[0];
            if (firstToken === 'หมายเลข') {
                // skip repeated header rows
                continue;
            }
            const parts = row.split(/\s+/);
            if (parts.length < 6) continue;

            // We know the last 3 tokens are: <type> <unit> <amount>
            const amount = parts.pop();
            const unit = parts.pop();
            const type = parts.pop();

            // The first tokens: <serviceNo> <HH:MM:SS> <DD/MM/YY>
            const serviceNo = parts.shift();
            const time = parts.shift() + ' ' + parts.shift(); // "08:27:27 26/01/68"
            const dest = parts.join(' ');
            cdrs.push({
                serviceNo: serviceNo ?? "",
                time: time ?? "",
                destination: dest ?? "",
                type: type ?? "",
                unit: unit ?? "",
                amount: amount ?? "",
            });
        }
    }

    return {
        nameAndAddress: address,
        headerKV: headerKV_Raw,
        billCycle: balancesBlock,
        summaryOfCurrentCharges: summary,
        forBankPayment: {
            ...bankKV_Raw,
            ref: refKV_Raw,
            dueDate: dueDate,
        },
        callDetailRecords: cdrs,
    };
};

export const performOCR = async (fileBuffer: Buffer, language: string = "tha+eng"): Promise<string> => {
    const { data: { text } } = await Tesseract.recognize(fileBuffer, language);
    return text.trim();
};

