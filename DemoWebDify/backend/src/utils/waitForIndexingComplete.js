import axios from "axios";
export default async function waitForIndexingComplete(datasetId, documentId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await axios.get(`http://localhost/v1/datasets/${datasetId}/documents`, {
      headers: { Authorization: "Bearer dataset-aGagieJ5FoHEMVoaOPh4EoLZ" },
      timeout: 30000
    });
    const status = res.data.data?.[0]?.indexing_status;
    if (status === "completed") return true;
    if (["failed", "error"].includes(status)) return false;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return false;
}
