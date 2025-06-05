import express from "express";
import axios from "axios";
import { prisma } from "../../app.js";
import chunkByToken from "../utils/chunkByToken.js";
import waitForIndexingComplete from "../utils/waitForIndexingComplete.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const results = await prisma.textChunk.findMany({ take: 1000 });
    const datasetId = "a9ca3537-b027-43c3-8acd-18028e77e3bc";

    for (const item of results) {
      const chunks = chunkByToken(item.text);

      for (let i = 0; i < chunks.length; i++) {
        const payload = {
          name: item.title || "Bill cal",
          text: chunks[i],
          indexing_technique: "high_quality",
          process_rule: { mode: "automatic" }
        };

        const createRes = await axios.post(
          `http://localhost/v1/datasets/${datasetId}/document/create-by-text`,
          payload,
          {
            headers: {
              Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ",
              "Content-Type": "application/json"
            },
            timeout: 60000
          }
        );

        const documentId = createRes.data.document.id;
        const indexed = await waitForIndexingComplete(datasetId, documentId);

        if (!indexed) continue;

        if (i > 0) {
          await axios.post(`http://localhost/v1/datasets/${datasetId}/documents/${documentId}/segments`, {
            segments: [{ content: chunks[i], answer: "", keywords: [] }]
          }, {
            headers: {
              Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ",
              "Content-Type": "application/json"
            },
            timeout: 60000
          });
        }
      }
    }

    res.json({ message: "✅ Sync completed." });
  } catch (err) {
    res.status(500).json({ error: "Internal sync error" });
  }
});

export default router;