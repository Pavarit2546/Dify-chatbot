import { Request, Response } from "express";
import config from "../config/config.js";
import { fetchProducts, createKnowledgeFromText, pollIndexingStatus } from "../services/product.service.js";

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const records = await fetchProducts();
    res.json({ records });
  } catch (err: any) {
    console.error("Knowledge fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
};

export const createProductKnowledge = async (req: Request, res: Response): Promise<void> => {
  const DATASET_ID = config.datasetId;
  const API_KEY = config.knowledgeApiToken;
  const ocrText = req.body.text;

  if (!ocrText) {
    res.status(400).json({ error: "Missing OCR text" });
    return;
  }

  try {
    const documentId = await createKnowledgeFromText(ocrText, DATASET_ID, API_KEY);
    const status = await pollIndexingStatus(DATASET_ID, documentId, API_KEY);

    if (status === "completed") {
      res.json({ message: "Document indexed successfully", documentId });
    } else {
      res.status(202).json({
        message: "Indexing still in progress",
        documentId,
        status,
      });
    }
  } catch (error: any) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to create knowledge from OCR text" });
  }
};