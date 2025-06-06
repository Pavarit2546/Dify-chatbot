import { prisma } from "../prisma.js";
import axios from "axios";

export const fetchProducts = async (): Promise<any[]> => {
  const results = await prisma.product.findMany({ take: 50 });
  return results.map((item) => ({
    content: `product: ${item.name} (${item.price} ${item.stock})`,
    score: 0.9,
    title: item.name,
    metadata: {
      name: item.name,
      price: item.price,
      stock: item.stock,
      source: "PostgreSQL",
    },
  }));
};

export const createKnowledgeFromText = async (ocrText: string, datasetId: string, apiKey: string): Promise<any> => {
  const createResponse = await axios.post(
    `http://localhost/v1/datasets/${datasetId}/document/create-by-text`,
    {
      name: "Product Knowledge",
      text: ocrText,
      indexing_technique: "high_quality",
      process_rule: { mode: "automatic" },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return createResponse.data.document.id;
};

export const pollIndexingStatus = async (datasetId: string, documentId: string, apiKey: string): Promise<string> => {
  let status = "waiting";
  let attempt = 0;
  const maxAttempts = 20;
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  while (status !== "completed" && attempt < maxAttempts) {
    const docList = await axios.get(`http://localhost/v1/datasets/${datasetId}/documents`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const targetDoc = docList.data.data.find((doc: any) => doc.id === documentId);

    if (!targetDoc) {
      throw new Error("Document not found in dataset");
    }

    status = targetDoc.indexing_status;

    if (status === "completed") {
      return status;
    }

    attempt++;
    await delay(2000);
  }

  return status;
};