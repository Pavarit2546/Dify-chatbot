import express from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import dotenv from "dotenv";
import multer from "multer";
import Tesseract from "tesseract.js";
import cors from "cors";
import { encode, decode } from "gpt-3-encoder";
// Load environment variables
dotenv.config();

// Set up multer
const upload = multer();
ฟ
// Initialize
const app = express();
const PORT = process.env.PORT || 8000;
const prisma = new PrismaClient();

app.use(cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: '*/*', limit: '100mb' }));

app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(req.headers['content-type']);
  next();
});


//text-chunks API
app.post("/text-chunks", async (req, res) => {
  const text = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing text content in body." });
  }

  try {
    const newChunk = await prisma.textChunk.create({
      data: {
        text,
      },
    });

    res.status(201).json({ message: "Saved successfully", data: newChunk });
  } catch (error) {
    console.error("Error saving text chunk:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//Get text-chunks API
app.get("/data-text-chunks", async (req, res) => {
  try {
    const results = await prisma.textChunk.findMany({ take: 50 });

    const records = results.map((item) => ({
      content: item.text,
      metadata: {
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        source: "PostgreSQL"
      }
    }));

    res.json({ records });
  } catch (err) {
    console.error("TextChunks fetch error:", err);
    res.status(500).json({ error: "Failed to fetch text chunks" });
  }
});


function chunkByToken(text, maxTokens = 250) {
  const tokens = encode(text);
  const chunks = [];

  for (let i = 0; i < tokens.length; i += maxTokens) {
    const chunkTokens = tokens.slice(i, i + maxTokens);
    chunks.push(decode(chunkTokens));
  }

  return chunks;
}

const waitForIndexingComplete = async (datasetId, documentId) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const res = await axios.get(
        `http://localhost/v1/datasets/${datasetId}/documents
`,
        {
          headers: {
            Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ"
          },
          timeout: 30000
        }
      );

      const status = res.data.data?.[0]?.indexing_status;

      if (status === "completed") {
        console.log("✅ Indexing completed for document:", documentId);
        return true;
      }

      if (status === "failed" || status === "error") {
        console.error("❌ Indexing failed for document:", documentId);
        return false;
      }

      console.log(`⌛ Waiting for indexing... (status: ${status})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (err) {
      console.error("❌ Error checking indexing status:", err.response?.data || err.message);
      return false;
    }
  }

  console.warn("⚠️ Timeout waiting for indexing to complete for document:", documentId);
  return false;
};


// 📥 Route
app.post("/sync-to-dify", async (req, res) => {
  try {
    const results = await prisma.textChunk.findMany({ take: 1000 });
    const datasetId = "a9ca3537-b027-43c3-8acd-18028e77e3bc";
    console.log("Dataset ID:", datasetId);
    for (const item of results) {
      const chunks = chunkByToken(item.text, 250);
      if (!chunks.length) continue;

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const payload = {
          name: item.title || "Bill cal",
          text: chunkText,
          indexing_technique: "high_quality",
          process_rule: {
            mode: "automatic"
          }
        };

        let documentId = null;
        let indexed = false;

        // 🔁 พยายามสร้าง document จนกว่าจะ indexing สำเร็จ
        for (let retry = 0; retry < 5 && !indexed; retry++) {
          try {
            console.log(`📤 Creating document (${i + 1}/${chunks.length})...`);
            const createRes = await axios.post(
              "http://localhost/v1/datasets/a9ca3537-b027-43c3-8acd-18028e77e3bc/document/create-by-text",
              payload,
              {
                headers: {
                  Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ",
                  "Content-Type": "application/json"
                },
                timeout: 60000
              }
            );

            documentId = createRes.data.document.id;
            console.log("Document created with ID:", documentId);

            indexed = await waitForIndexingComplete(datasetId, documentId);
            if (!indexed) {
              console.log("⏳ Indexing not completed, retrying...");
              await new Promise((r) => setTimeout(r, 5000));
            }
          } catch (err) {
            console.error("❌ Error creating document or waiting for indexing:", err.response?.data || err.message);
            await new Promise((r) => setTimeout(r, 5000));
          }
        }

        if (!indexed) {
          console.warn("⚠️ Failed to index document after retries. Skipping...");
          continue;
        }

        // ✅ หากไม่ใช่ chunk แรก ควรใช้ endpoint สำหรับเพิ่ม segment (เลือกได้ตาม use case)
        if (i > 0) {
          const segmentPayload = {
            segments: [
              {
                content: chunkText,
                answer: "",
                keywords: []
              }
            ]
          };

          try {
            await axios.post(
              `http://localhost/v1/datasets/a9ca3537-b027-43c3-8acd-18028e77e3bc/documents/${documentId}/segments`,
              segmentPayload,
              {
                headers: {
                  Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ",
                  "Content-Type": "application/json"
                },
                timeout: 60000
              }
            );

            console.log("➕ Segment added to document:", documentId);
          } catch (err) {
            console.error("❌ Failed to add segment:", err.response?.data || err.message);
          }
        }
      }
    }

    res.json({ message: "✅ Sync completed." });
  } catch (e) {
    console.error("❌ Unexpected error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

const DATASET_ID = '6ec7d7cf-b562-4566-95ba-87a056350626';

app.post('/ocr-to-knowledge', async (req, res) => {
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

// --- OCR API ---
app.post("/ocr", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const language = req.body.language || "tha+eng";

    if (!file) {
      return res.status(400).json({ error: "file is required" });
    }

    const { data: { text } } = await Tesseract.recognize(file.buffer, language, {
      logger: (m) => console.log("OCR Progress:", m),
      config: [
        "tessedit_char_whitelist=0123456789.-",
        "load_system_dawg=0",
        "load_freq_dawg=0",
        "classify_bln_numeric_mode=1"
      ]
    });

    res.json({ extractedText: text.trim() });
  } catch (err) {
    console.error("❌ OCR API Error:", err.message);
    res.status(500).json({ error: "OCR failed" });
  }
});


// --- User API ---
app.get("/user", async (req, res) => {
  try {
    const results = await prisma.user.findMany({ take: 50 });

    const records = results.map((item) => ({
      content: `User: ${item.username} (${item.firstName} ${item.lastName})`,
      score: 0.9,
      title: item.firstName || item.username,
      metadata: {
        email: item.email,
        role: item.role,
        username: item.username,
        firstName: item.firstName,
        lastName: item.lastName,
        source: "PostgreSQL"
      }
    }));

    res.json({ records });
  } catch (err) {
    console.error("Knowledge fetch error:", err);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

// --- Salary API ---
app.get("/salary", async (req, res) => {
  try {
    const results = await prisma.salary.findMany({
      take: 50,
      include: { user: true }
    });

    const records = results.map((item) => ({
      content: `salary: ${item.userId} (${item.amount} ${item.user.username})`,
      score: 0.9,
      title: item.userId || item.amount,
      metadata: {
        amount: item.amount,
        userId: item.userId,
        user: item.user.username,
        source: "PostgreSQL"
      }
    }));

    res.json({ records });
  } catch (err) {
    console.error("Knowledge fetch error:", err);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

app.get("/product", async (req, res) => {
  try {
    const results = await prisma.product.findMany({ take: 50 });

    const records = results.map((item) => ({
      content: `porduct: ${item.name} (${item.price} ${item.stock})`,
      score: 0.9,
      title: item.name,
      metadata: {
        name: item.name,
        price: item.price,
        stock: item.stock,
        source: "PostgreSQL"
      }
    }));

    res.json({ records });
  } catch (err) {
    console.error("Knowledge fetch error:", err);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

app.get("/admin", async (req, res) => {
  try {
    // ดึงข้อมูล User พร้อม Salary
    const users = await prisma.user.findMany({
      include: {
        salaries: true // เชื่อม relation กับ salary (ต้องตั้ง relation ชื่อให้ถูกใน schema)
      }
    });

    // ดึงข้อมูล Product
    const products = await prisma.product.findMany({ take: 50 });

    // สร้าง object รวม
    const adminData = users.map((user) => ({
      user: {
        id: user.id,
        username: user.username,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
      },
      salaries: user.salaries.map(sal => ({
        id: sal.id,
        amount: sal.amount,
        month: sal.month,
        year: sal.year,
      })),
    }));

    res.json({
      users: adminData,
      products: products.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        stock: item.stock
      }))
    });
  } catch (err) {
    console.error("❌ Admin fetch error:", err);
    res.status(500).json({ error: "Failed to fetch admin data" });
  }
});

app.get("/user/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id); // ✅ แปลงเป็น Int

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await prisma.user.findUnique({
      where: { id }, // ✅ id เป็น Int แล้ว
      include: {
        salaries: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user_id: user.id,
      username: user.username,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      salaries: user.salaries.map((sal) => ({
        id: sal.id,
        amount: sal.amount,
        month: sal.month,
        year: sal.year,
      }))
    });
  } catch (err) {
    console.error("User fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

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

function splitKV(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}

function collectKV(lines) {
  return lines.reduce((acc, l) => {
    const kv = splitKV(l);
    if (kv) acc[kv[0]] = kv[1];
    return acc;
  }, {});
}

function buildBillObject(raw) {
  const lines = getCleanLines(raw);

  // 1) Header KV: only the five known fields
  const headerLines = lines.filter((l) =>
    /^(หมายเลขบริการ|รหัสลูกค้า|เลขที่ใบแจ้งค่าใช้บริการ|วันที่ออกใบแจ้งค่าใช้บริการ|รหัสกลุ่มลูกค้า)/.test(l)
  );
  const headerKV = collectKV(headerLines);

  // 2) Address block
  const addrStart = lines.findIndex((l) => l.includes('ชื่อและที่อยู่สำาหรับจัดส่งเอกสาร'));
  const addressLines = addrStart > -1 ? lines.slice(addrStart + 1, addrStart + 6) : [];
  const address = addressLines.join(' ');

  // 3) Bill cycle & balances
  const billCycleLine = lines.find((l) => l.startsWith('รอบค่าใช้บริการ')) || '';
  const billCycleMatch = billCycleLine.match(/: ([\d\/]+ - [\d\/]+)/);
  const billCycle = billCycleMatch ? billCycleMatch[1] : '';

  const balanceStartIdx = lines.findIndex((l) => l.includes('ยอดยกมา'));
  let balanceValues = [];

  // Scan up to 15 lines after "ยอดยกมา"
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

  const balancesObj =
    balanceValues.length === 6
      ? {
        'ยอดยกมา (Previous Balance)': balanceValues[0],
        'ยอดเงินที่ชำระแล้ว (Paid Amount)': balanceValues[1],
        'ยอดปรับปรุง (Adjustment)': balanceValues[2],
        'ยอดค่าใช้บริการรอบปัจจุบัน (Current Charge)': balanceValues[3],
        'ยอดรวมที่ต้องชำระทั้งสิ้น (Total Outstanding Balance)': balanceValues[4],
        'วันครบกำาหนดชำระรอบปัจจุบัน (Current Due Date)': balanceValues[5],
      }
      : {};

  const balancesBlock = {
    billCycle,
    balances: balancesObj,
  };

  // 4) Summary of Current Charges
  const sumIdx = lines.findIndex((l) => l.includes('สรุปค่าใช้บริการรอบปัจจุบัน'));
  const summary = {};
  if (sumIdx > -1) {
    let currentSection = null;
    for (let i = sumIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      if (/^บริการ/.test(l)) {
        currentSection = l;
        summary[currentSection] = [];
        continue;
      }
      if (/ผู้รับเงิน|ผ่านธนาคาร/.test(l)) break;
      const m = l.match(/^(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
      if (m && currentSection) {
        summary[currentSection].push({
          'ประเภทบริการ (Type of Service)': m[1].trim(),
          'ค่าบริการ (Service Charge)': m[2],
          'ส่วนลด (Discount)': m[3],
          'จำนวนเงิน (Amount)': m[4],
        });
      }
    }
  }

  // 5) Bank payment section
  const bankIdx = lines.findIndex((l) => l.includes('ผ่านธนาคาร'));
  const bankKV = bankIdx > -1 ? collectKV(lines.slice(bankIdx + 1, bankIdx + 8)) : {};
  const refKV = bankIdx > -1 ? collectKV(lines.slice(bankIdx + 8, bankIdx + 12)) : {};

  // 6) Due Date
  const dueLine = lines.find((l) => l.includes('(Due Date)')) || '';
  const dueDate = dueLine.includes(':') ? dueLine.split(':')[1].trim() : '';

  // 7) Call Detail Records
  const cdrIdx = lines.findIndex((l) => l.includes('หมายเลข') && l.includes('เวลา ว/ด/ป') && l.includes('เรียกไป'));

  const cdrs = [];
  if (cdrIdx > -1) {
    for (let i = cdrIdx + 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;

      // Skip any line that exactly matches the header row (or whose first token is "หมายเลข")
      const firstToken = row.split(/\s+/)[0];
      if (firstToken === 'หมายเลข') {
        continue;
      }

      const parts = row.split(/\s+/);
      if (parts.length < 6) continue;

      // Extract amount, unit, type from the end
      const amount = parts.pop(); // “0.50”
      const unit = parts.pop(); // “1”
      const type = parts.pop(); // e.g. “AIS3G” or “NT”

      // Now parts = [ serviceNo, time, date, ...destinationParts ]
      const serviceNo = parts.shift(); // e.g. “0814435901”
      const time = parts.shift() + ' ' + parts.shift(); // e.g. “09:08:34 26/01/68”
      const dest = parts.join(' '); // e.g. “BKK” or “MB BKK my by”

      cdrs.push({
        หมายเลข: serviceNo,
        'เวลา ว/ด/ป': time,
        เรียกไป: dest,
        ประเภท: type,
        หน่วย: unit,
        จำานวนเงิน: amount,
      });
    }
  }
  return {
    ชื่อและที่อยู่สำาหรับจัดส่งเอกสาร: address,
    headerKV,
    'รอบค่าใช้บริการ (Bill Cycle)': balancesBlock,
    'สรุปค่าใช้บริการรอบปัจจุบัน (Summary of Current Charges)': summary,

    'สำหรับการรับชำระค่าบริการผ่านธนาคาร/ตัวแทนรับชำระ': {
      ...bankKV,
      ref: refKV,
      'โปรดชำระเงินภายในวันที่ (Due Date)': dueDate,
    },
    รายการโทรศัพท์: cdrs,
  };
}

app.post('/clean-doc', (req, res) => {
  try {
    const payload = buildBillObject(req.body || '');
    res.send({ data: payload });
    // console.log(data);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// API สำหรับการดสร้าง Knowledge Base ใน Dify
const API_URL = process.env.DIFY_API_URL;
const API_KEY = process.env.DIFY_API_KEY;

const headers = {
  Authorization: `Bearer ${API_KEY}`

};

app.get('/datasets/:datasetId/documents', async (req, res) => {
  const { datasetId } = req.params;

  try {
    const response = await axios.get(`${API_URL}/datasets/${datasetId}/documents`, {
      headers,
    });
    console.log('✅ [Response] Dify documents data:', JSON.stringify(response.data, null, 2));
    res.json({
      datasetId,
      documents: response.data,
    });

  } catch (err) {
    console.error('[ERROR]', err.response?.data || err.message);
    res.status(500).json(err.response?.data || { error: err.message });
  }
});


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
