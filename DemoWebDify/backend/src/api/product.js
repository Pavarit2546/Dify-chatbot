import express from "express";
import axios from "axios";
import { prisma } from "../../app.js";

const router = express.Router();

router.get("/", async (req, res) => {
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

router.post("/to-knowledge", async (req, res) => {
    const DATASET_ID = 'dbd53c1e-29e5-44aa-9167-e20cc7cbab2d';
    const ocrText = req.body.text;
    if (!ocrText) return res.status(400).json({ error: 'Missing OCR text' });

    try {
        // สร้าง document จาก text
        const createResponse = await axios.post(
            `http://localhost/v1/datasets/${DATASET_ID}/document/create-by-text`,
            {
                name: "Product Knowledge",
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

export default router;