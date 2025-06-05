import express from "express";
import { prisma } from "../../app.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const text = req.body;
  if (!text) return res.status(400).json({ error: "Missing text content" });

  try {
    const newChunk = await prisma.textChunk.create({ 
        data: { text } 
    });
    res.status(201).json({ 
        message: "Saved", 
        data: newChunk });
  } catch (err) {
    res.status(500).json({ error: "Save failed" });
  }
});

router.get("/data", async (req, res) => {
  try {
    const results = await prisma.textChunk.findMany({ take: 50 });
    res.json({
      records: results.map(item => ({
        content: item.text,
        metadata: { 
            id: item.id, 
            createdAt: item.createdAt.toISOString(), 
            source: "PostgreSQL" }
      }))
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

export default router;