import { Request, Response } from "express";
import config from "../config/config.js";
import { createKnowledgeBase, pollIndexingStatusKnowledge } from "../services/knowledge.service.js";

export const toKnowledgeHandler = async (req: Request, res: Response): Promise<void> => {
    const DATASET_ID = config.knowledgeApiToken;
    const API_KEY = config.difyWebhookUrl;
    const ocrText = req.body.text;

    if (!ocrText) {
        res.status(400).json({ error: "Missing OCR text" });
        return;
    }

    try {
        const documentId = await createKnowledgeBase(ocrText, DATASET_ID, API_KEY);
        const indexingResult = await pollIndexingStatusKnowledge(DATASET_ID, documentId, API_KEY);

        if (indexingResult.status === "completed") {
            res.json({ message: "Document indexed successfully", documentId });
        } else {
            res.status(202).json({
                message: "Indexing still in progress",
                documentId,
                status: indexingResult.status,
            });
        }
    } catch (error: any) {
        res.status(500).json({ error: "Failed to create knowledge from OCR text" });
    }
};