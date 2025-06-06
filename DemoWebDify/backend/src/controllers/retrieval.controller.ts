import { Request, Response } from "express";
import { retrieveKnowledge } from "../services/retrieval.service.js";

export const externalKnowledgeRetrieval = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await retrieveKnowledge(req);
        res.json(result);
    } catch (err: any) {
        console.error("Error in external knowledge retrieval:", err.message);
        res.status(500).json({ error: "Failed to process external knowledge request" });
    }
};