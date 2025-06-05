import express from 'express';
import { PrismaClient } from '@prisma/client';
const router = express.Router();
const prisma = new PrismaClient();

router.post("/text-chunks", async (req, res) => {
  const text = req.body;
  if (!text) return res.status(400).json({ error: "Missing text content in body." });
  try {
    const newChunk = await prisma.textChunk.create({ data: { text } });
    res.status(201).json({ message: "Saved successfully", data: newChunk });
  } catch (error) {
    console.error("Error saving text chunk:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/data-text-chunks", async (req, res) => {
  try {
    const results = await prisma.textChunk.findMany({ take: 50 });
    const records = results.map(item => ({
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

export default router;