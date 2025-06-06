import axios from "axios";
import config from "../config/config.js";

const VALID_API_KEY = config.varidExternalApiKey;

function formatCallDetails(callDetailRecords: Array<any> = []): string {
    return callDetailRecords.map((record, i) => {
        return `(${i + 1}) ${record.serviceNo} โทรไปยัง ${record.destination} เวลา ${record.time} ประเภท ${record.type} จำนวน ${record.unit} หน่วย คิดเป็นเงิน ${record.amount} บาท`;
    }).join("\n");
}

export const retrieveKnowledge = async (req: any): Promise<any> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Missing or invalid Authorization header");
    }

    const apiKey = authHeader.split(" ")[1];
    if (apiKey !== VALID_API_KEY) {
        throw new Error("Forbidden: Invalid API Key");
    }

    const inputTextResponse = await axios.get("http://localhost:8000/ocr/clean-doc/last");
    const inputText = inputTextResponse.data.lastResult;

    const knowledgeId = req.body.knowledge_id || 3;
    const topK = req.body.retrieval_setting?.top_k || 3;
    const scoreThreshold = req.body.retrieval_setting?.score_threshold ?? 0;

    const callRecords = inputText.callDetailRecords;
    if (!Array.isArray(callRecords)) {
        throw new Error("Invalid callDetailRecords format");
    }

    await axios.put(
        `https://dify-chatflow-default-rtdb.firebaseio.com/knowledge/${knowledgeId}.json?auth=${VALID_API_KEY}`,
        callRecords
    );

    const firebaseUrl = `https://dify-chatflow-default-rtdb.firebaseio.com/knowledge/${knowledgeId}.json?auth=${VALID_API_KEY}`;
    const response = await axios.get(firebaseUrl);
    const rawData = response.data;

    if (!Array.isArray(rawData)) {
        throw new Error("Firebase data is not in expected array format");
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
                dueDate: item.forBankPayment?.dueDate,
            },
            score: item.score || 0.9,
        };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null) // กรอง null ออก
    .sort((a, b) => b.score - a.score);
    return { records: matches.slice(0, topK) };
};