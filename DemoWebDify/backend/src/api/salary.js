import express from "express";
import axios from "axios";
import { prisma } from "../../app.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const results = await prisma.salary.findMany({
      take: 50,
      include: { user: true },
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch salary" });
  }
});


// เป็น endpoint สำหรับ external API ที่ Dify ใช้ในการอัพเดตค่าและดึงข้อมูลเงินเดือนจาก Firebase
router.post("/sync-salary-to-firebase/retrieval", async (req, res) => {
  const VALID_API_KEY = "S6GlcUFY5lBLbYVDVsidbNWRU0wQspVXXiCOwpmc";
  try {
    // ✅ ตรวจสอบ Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const apiKey = authHeader.split(" ")[1];
    if (apiKey !== VALID_API_KEY) {
      return res.status(403).json({ error: "Forbidden: Invalid API Key" });
    }

    // ✅ รับค่าจาก body
    const knowledgeId = req.body.knowledge_id || 2;
    const query = req.body.query;
    const retrievalSetting = req.body.retrieval_setting || {};
    const topK = retrievalSetting.top_k || 2;
    const scoreThreshold = retrievalSetting.score_threshold ?? 0;

    console.log("Knowledge ID:", knowledgeId);
    console.log("Received query:", query);
    console.log("Retrieval setting:", retrievalSetting);

   // ✅ ดึงข้อมูลจาก database ผ่าน Prisma
    const results = await prisma.salary.findMany({
      take: 100,
      include: { user: true },
    });

    const cleanedData = results
      .filter(item => item && item.user)
      .map(item => ({
        id: item.id,
        amount: item.amount,
        date: item.date,
        userId: item.userId,
        user: {
          email: item.user.email,
          firstName: item.user.firstName,
          lastName: item.user.lastName,
          role: item.user.role,
        },
      }));

    // ✅ นำข้อมูลไปยัง Firebase knowledge/{id}
    const firebaseUrl = `https://dify-chatflow-default-rtdb.firebaseio.com/knowledge/${knowledgeId}.json?auth=${VALID_API_KEY}`;
    await axios.put(firebaseUrl, cleanedData);
    console.log("✅ Firebase knowledge updated");

    // ✅ ทำ retrieval ดึงข้อมูลจาก Firebase
    const matches = cleanedData
      .map(item => {
        if (!item || !item.user) return null;

        const fullName = `${item.user.firstName} ${item.user.lastName}`.toLowerCase();
        const email = item.user.email.toLowerCase();
        const role = item.user.role.toLowerCase();
        const q = query?.toLowerCase() || "";

        const isMatch = fullName.includes(q) || email.includes(q) || role.includes(q);
        const score = isMatch ? 1.0 : 0.0;

        return {
          id: item.id,
          name: `${item.user.firstName} ${item.user.lastName}`,
          email: item.user.email,
          role: item.user.role,
          salary: item.amount,
          date: item.date,
          score
        };
      })
      .filter(r => r && r.score >= scoreThreshold);

    matches.sort((a, b) => b.score - a.score);
    const topResults = matches.slice(0, topK);

    if (topResults.length === 0) {
      return res.json([
        {
          content: "ไม่พบข้อมูลที่ตรงกับคำค้นหา",
          metadata: {
            score: 0
          }
        }
      ]);
    }

    const result = topResults.map(item => ({
      content: `ชื่อ: ${item.name}\nอีเมล: ${item.email}\nตำแหน่ง: ${item.role}\nเงินเดือน: ${item.salary}\nวันที่: ${item.date}`,
      metadata: {
        id: item.id,
        description: `ข้อมูลเงินเดือนของ ${item.name}`
      },
      title: `เงินเดือนของ ${item.name}`,
      score: item.score || 0.9
    }));

    res.json({
      records: result
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});


export default router;
