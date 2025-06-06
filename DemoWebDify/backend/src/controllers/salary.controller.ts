import { Request, Response } from "express";
import config from "../config/config.js";
import { fetchSalaries, syncSalaryToFirebase, retrieveSalaryData } from "../services/salary.service.js";

export const getSalaries = async (req: Request, res: Response): Promise<void> => {
  try {
    const results = await fetchSalaries();
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch salary" });
  }
};

export const syncSalaryToFirebaseRetrieval = async (req: Request, res: Response): Promise<void> => {
  const EXTERNAL_KNOWLEDGE_API_KEY = config.externalKnowledgeApiKey || "";
  if (!EXTERNAL_KNOWLEDGE_API_KEY) {
    res.status(500).json({ error: "External knowledge API key is not configured" });
    return;
  }
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const apiKey = authHeader.split(" ")[1];
    if (apiKey !== EXTERNAL_KNOWLEDGE_API_KEY) {
      res.status(403).json({ error: "Forbidden: Invalid API Key" });
      return;
    }

    const knowledgeId = req.body.knowledge_id || 2;
    const query = req.body.query;
    const retrievalSetting = req.body.retrieval_setting || {};
    const topK = retrievalSetting.top_k || 2;
    const scoreThreshold = retrievalSetting.score_threshold ?? 0;

    const results = await fetchSalaries();

    const cleanedData = results
      .filter((item) => item && item.user)
      .map((item) => ({
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

    await syncSalaryToFirebase(knowledgeId, cleanedData);

    const matches = await retrieveSalaryData(query, cleanedData, topK, scoreThreshold);

    if (matches.length === 0) {
      res.json([
        {
          content: "ไม่พบข้อมูลที่ตรงกับคำค้นหา",
          metadata: {
            score: 0,
          },
        },
      ]);
      return;
    }

    const result = matches.map((item) => ({
      content: `ชื่อ: ${item.name}\nอีเมล: ${item.email}\nตำแหน่ง: ${item.role}\nเงินเดือน: ${item.salary}\nวันที่: ${item.date}`,
      metadata: {
        id: item.id,
        description: `ข้อมูลเงินเดือนของ ${item.name}`,
      },
      title: `เงินเดือนของ ${item.name}`,
      score: item.score || 0.9,
    }));

    res.json({ records: result });
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: "Failed to process request" });
  }
};