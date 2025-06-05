import express from "express";
import axios from "axios";

const router = express.Router();

router.post("/", async (req, res) => {
  const { data } = req.body;

  try {
    const response = await axios.post("https://api.dify.ai/sync", data, {
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to sync to Dify" });
  }
});

export default router;
