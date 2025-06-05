import express from "express";
import Tesseract from "tesseract.js";
import axios from "axios";
import upload from "../middlewares/upload.js";

const router = express.Router();

router.post("/", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        const language = req.body.language || "tha+eng";
        if (!file) return res.status(400).json({ error: "file is required" });

        const { data: { text } } = await Tesseract.recognize(file.buffer, language);
        res.json({ extractedText: text.trim() });
    } catch (err) {
        res.status(500).json({ error: "OCR failed" });
    }
});


// เป็น endpoint สำหรับแปลงเป็น json object
// 1) Clean up newline control characters and split into trimmed lines
function getCleanLines(raw) {
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
function splitKV(line) {
    const idx = line.indexOf(':');
    if (idx === -1) return null;
    return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}

// 3) Convert something like
//     "หมายเลขบริการ (Service No.)"
//    into just "serviceNo"
function extractEnglishKey(rawKey) {
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
function collectKV(lines) {
    return lines.reduce((acc, line) => {
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

// --------------------------------------------------------------------------------
// MAIN PARSING FUNCTION
// --------------------------------------------------------------------------------

function buildBillObject(raw) {
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
    let balanceValues = [];
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
    const summary = {};
    if (sumIdx > -1) {
        let currentSection = null;

        // A lookup table to convert the Thai section line into an English key:
        const sectionNameMap = {
            // Example: the literal Thai line "บริการ ISDN-PRI 2 เลขหมายหลัก"
            // maps to "ISDN_PRI"
            'บริการ ISDN-PRI 2 เลขหมายหลัก': 'ISDN_PRI',
            // The literal Thai line "บริการ SIP Trunk 1 Trunk"
            // maps to "SIP_Trunk"
            'บริการ SIP Trunk 1 Trunk': 'SIP_Trunk',
            // If you have other possible section headings, add them here...
        };

        for (let i = sumIdx + 1; i < lines.length; i++) {
            const l = lines[i].trim();
            if (!l) continue;

            // If the line _exactly_ matches one of our known Thai headings → start a new section
            if (sectionNameMap[l]) {
                currentSection = sectionNameMap[l];
                summary[currentSection] = [];
                continue;
            }
            // If we hit “ผู้รับเงิน” or “ผ่านธนาคาร”, we stop parsing summary
            if (/ผู้รับเงิน|ผ่านธนาคาร/.test(l)) {
                break;
            }

            // Otherwise, try to match lines like:
            //   "<Type of Service>  <ServiceCharge>  <Discount>  <Amount>"
            const m = l.match(/^(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
            if (m && currentSection) {
                summary[currentSection].push({
                    typeofService: m[1].trim(), // The name of the service (in Thai—but you could translate if you like)
                    serviceCharge: m[2], // e.g. "36,000.00"
                    discount: m[3], // e.g. "0.00"
                    amount: m[4], // e.g. "36,000.00"
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

    const cdrs = [];
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
                serviceNo,
                time,
                destination: dest,
                type,
                unit,
                amount,
            });
        }
    }

    // ----------------------------
    // 7) BUILD THE FINAL OBJECT
    //    Top‐level keys are all in English:
    //      nameAndAddress, headerKV, billCycle, summaryOfCurrentCharges,
    //      forBankPayment, callDetailRecords
    // ----------------------------
    return {
        nameAndAddress: address, // string
        headerKV: headerKV_Raw, // { serviceNo, accountNo, invoiceNo, issueDate, groupNo }
        billCycle: balancesBlock, // { billCycle, balances: { previousBalance, …, currentDueDate } }
        summaryOfCurrentCharges: summary, // { ISDN_PRI: [ … ], SIP_Trunk: [ … ] }
        forBankPayment: {
            // We know bankKV_Raw might have: { serviceNo, accountNo, invoiceNo, customerName, address, amount }
            // and refKV_Raw might have: { discount, serviceCode, ref1, ref2 }
            ...bankKV_Raw,
            ref: refKV_Raw, // { discount, serviceCode, ref1, ref2 }
            dueDate: dueDate, // string
        },
        callDetailRecords: cdrs, // [ { serviceNo, time, destination, type, unit, amount }, … ]
    };
}

// เป็น endpoint สำหรับ clean doc ให้อยู่ในรูปแบบ JSON object
let lastResult = null;
router.post('/clean-doc', express.text({ type: '*/*', limit: '200mb' }), (req, res) => {
    try {
        const payload = buildBillObject(req.body || '');
        lastResult = payload;
        res.send({ data: payload });
        console.log('Payload built successfully:', payload);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});
// เป็น endpoint สำหรับดึงข้อมูลล่าสุดที่ถูก clean-doc ใน endpoint external-knowledge/retrieval
router.get('/clean-doc/last', (req, res) => {
    if (!lastResult) {
        return res.status(404).send({ error: 'No data yet' });
    }
    res.send({ lastResult });
});

// เป็น endpoint สำหรับสร้าง knowledge base จาก image OCR text ในการคำนวณบิล 
router.post("/to-knowledge", express.urlencoded({ extended: true }), async (req, res) => {
    const DATASET_ID = '6ec7d7cf-b562-4566-95ba-87a056350626';
    const ocrText = req.body.text;
    if (!ocrText) return res.status(400).json({ error: 'Missing OCR text' });

    try {
        // สร้าง document จาก text
        const createResponse = await axios.post(
            `http://localhost/v1/datasets/${DATASET_ID}/document/create-by-text`,
            {
                name: "Bill cal",
                text: ocrText,
                indexing_technique: "high_quality",
                process_rule: {
                    mode: "automatic"
                }
            },
            {
                headers: {
                    Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ",
                    'Content-Type': 'application/json'
                }
            }
        );

        const documentId = createResponse.data.document.id;
        console.log('Document created:', documentId);

        // Polling ตรวจสอบ indexing_status
        let status = 'waiting';
        let attempt = 0;
        const maxAttempts = 20;
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        while (status !== 'completed' && attempt < maxAttempts) {
            const docList = await axios.get(
                `http://localhost/v1/datasets/${DATASET_ID}/documents`,
                {
                    headers: {
                        Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ"
                    }
                }
            );

            const targetDoc = docList.data.data.find((doc) => doc.id === documentId);

            if (!targetDoc) {
                return res.status(404).json({ error: 'Document not found in dataset' });
            }

            status = targetDoc.indexing_status;
            console.log(`Attempt ${attempt + 1}: status = ${status}`);

            if (status === 'completed') {
                return res.json({ message: 'Document indexed successfully', documentId });
            }

            attempt++;
            await delay(2000);
        }

        return res.status(202).json({
            message: 'Indexing still in progress',
            documentId,
            status
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(500).json({ error: 'Failed to create knowledge from OCR text' });
    }
});


// เป็น endpoint สำหรับใช้ ocr external knowledge retrieval จาก Firebase
function formatCallDetails(callDetailRecords = []) {
    return callDetailRecords.map((record, i) => {
        return `(${i + 1}) ${record.serviceNo} โทรไปยัง ${record.destination} เวลา ${record.time} ประเภท ${record.type} จำนวน ${record.unit} หน่วย คิดเป็นเงิน ${record.amount} บาท`;
    }).join("\n");
}
router.post("/external-knowledge/retrieval", express.json({ type: '*/*', limit: '200mb' }), async (req, res) => {
    const VALID_API_KEY = "S6GlcUFY5lBLbYVDVsidbNWRU0wQspVXXiCOwpmc";
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }

        const apiKey = authHeader.split(" ")[1];
        if (apiKey !== VALID_API_KEY) {
            return res.status(403).json({ error: "Forbidden: Invalid API Key" });
        }

        const inputText = await axios.get("http://localhost:8000/ocr/clean-doc/last");

        const knowledgeId = req.body.knowledge_id || 3;
        const topK = req.body.retrieval_setting?.top_k || 3;
        const scoreThreshold = req.body.retrieval_setting?.score_threshold ?? 0;
        console.log("Knowledge ID:", knowledgeId);
        console.log("Input text:", inputText);
        console.log("Top K:", topK);
        console.log("Score threshold:", scoreThreshold);

        const cleaned = inputText.data.lastResult;
        const callRecords = cleaned.callDetailRecords;

        if (!Array.isArray(callRecords)) {
            return res.status(500).json({ error: "Invalid callDetailRecords format" });
        }

        // 🔹 Step 2: PUT ลง Firebase
        await axios.put(`https://dify-chatflow-default-rtdb.firebaseio.com/knowledge/${knowledgeId}.json?auth=${VALID_API_KEY}`, callRecords);
        console.log("✅ Migrate สำเร็จไปยัง knowledge/3");


        // กรณีปกติ → ดึงจาก Firebase
        const firebaseUrl = `https://dify-chatflow-default-rtdb.firebaseio.com/knowledge/${knowledgeId}.json?auth=${VALID_API_KEY}`;
        const response = await axios.get(firebaseUrl);
        const rawData = response.data;

        if (!Array.isArray(rawData)) {
            return res.status(500).json({ error: "Firebase data is not in expected array format" });
        }


        const matches = rawData.map((item, index) => {
            if (!item || !item.callDetailRecords) return null;

            const fullText = JSON.stringify(item).toLowerCase();
            const q = inputText.toLowerCase();
            const isMatch = fullText.includes(q);
            const score = isMatch ? 1.0 : 0.0;

            const title = `ใบแจ้งค่าใช้บริการรอบบิล ${item.billCycle?.billCycle || "ไม่ระบุ"}`;
            const content = `
ชื่อและที่อยู่: ${item.nameAndAddress || "ไม่ระบุ"}
วันครบกำหนด: ${item.forBankPayment?.dueDate || "ไม่ระบุ"}
สรุปรายการโทร:
${formatCallDetails(item.callDetailRecords)}
      `.trim();

            return {
                title,
                content,
                metadata: {
                    source: `firebase-knowledge-${knowledgeId}`,
                    itemIndex: index,
                    dueDate: item.forBankPayment?.dueDate
                },
                score: item.score || 0.9
            };
        }).filter(r => r && r.score >= scoreThreshold);

        matches.sort((a, b) => b.score - a.score);
        const topResults = matches.slice(0, topK);

        return res.json({ records: topResults });
    } catch (err) {
        console.error("Error in external knowledge retrieval:", err);
        return res.status(500).json({ error: "Failed to process external knowledge request" });
    }
});

export default router;