import { Request, Response } from "express";
import { performOCR, buildBillObject } from "../services/ocr.service.js";

let lastResult: any = null;

export const ocrImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.file;
        const language = req.body.language || "tha+eng";
        if (!file) {
            res.status(400).json({ error: "file is required" });
            return;
        }

        const extractedText = await performOCR(file.buffer, language);
        res.json({ extractedText });
    } catch (err) {
        res.status(500).json({ error: "OCR failed" });
    }
};

export const cleanDoc = (req: Request, res: Response): void => {
    try {
        const payload = buildBillObject(req.body || "");
        lastResult = payload;
        res.send({ data: payload });
    } catch (err: any) {
        res.status(500).send({ error: err.message });
    }
};

export const getLastCleanDoc = (req: Request, res: Response): void => {
    if (!lastResult) {
        res.status(404).send({ error: "No data yet" });
        return;
    }
    res.send({ lastResult });
};