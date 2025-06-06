import axios from "axios";

export const createKnowledgeBase = async (ocrText: string, datasetId: string, apiKey: string): Promise<string> => {
    const response = await axios.post(
        `http://localhost/v1/datasets/${datasetId}/document/create-by-text`,
        {
            name: "Bill cal",
            text: ocrText,
            indexing_technique: "high_quality",
            process_rule: { mode: "automatic" },
        },
        {
            headers: {
                Authorization: apiKey,
                "Content-Type": "application/json",
            },
        }
    );
    return response.data.document.id;
};

export const pollIndexingStatusKnowledge = async (datasetId: string, documentId: string, apiKey: string): Promise<{ status: string; documentId: string }> => {
    let status = "waiting";
    let attempt = 0;
    const maxAttempts = 20;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (status !== "completed" && attempt < maxAttempts) {
        const response = await axios.get(
            `http://localhost/v1/datasets/${datasetId}/documents`,
            {
                headers: { Authorization: apiKey },
            }
        );

        const targetDoc = response.data.data.find((doc: any) => doc.id === documentId);
        if (!targetDoc) throw new Error("Document not found in dataset");

        status = targetDoc.indexing_status;
        if (status === "completed") {
            return { status, documentId };
        }

        attempt++;
        await delay(2000);
    }

    return { status, documentId };
};