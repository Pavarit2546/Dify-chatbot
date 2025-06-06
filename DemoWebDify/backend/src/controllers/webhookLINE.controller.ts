import { Request, Response } from "express";
import config from "../config/config.js";
import axios from "axios";
import {
  verifySignature,
  fetchMediaFromLINE,
  LineuploadFileToDify,
  sendMessageToLINE,
  sendLoadingIndicatorToLINE,
} from "../services/webhookLINE.service.js";

export const handleLINEWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers["x-line-signature"] as string;
  const rawBody = req.rawBody as Buffer;

  const LINE_CHANNEL_SECRET = config.lineChannelSecret || "";
  if (!LINE_CHANNEL_SECRET) {
    res.status(500).send("LINE channel secret is not configured");
    return;
  }
  const LINE_CHANNEL_ACCESS_TOKEN = config.lineChannelAccessToken || "";
  const DIFY_API_KEY_LINE = config.difyApiKeyLine || "";

  if (!verifySignature(rawBody, signature, LINE_CHANNEL_SECRET)) {
    res.status(401).send("Invalid signature");
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString());
  } catch (err) {
    res.status(400).send("Invalid JSON");
    return;
  }

  const events = body.events || [];
  if (!events.length) {
    res.status(200).send("No events");
    return;
  }

  const { replyToken, message, source } = events[0];
  const userId = source.userId;

  if (!message || !message.type) {
    res.status(200).send("Unsupported message");
    return;
  }

  let messageText = message.text || "";
  let files: any[] = [];
  const messageType = message.type;
  const supportedMediaTypes = ["image", "audio", "video", "file"];

  if (supportedMediaTypes.includes(messageType)) {
    try {
      const { buffer, contentType } = await fetchMediaFromLINE(message.id, LINE_CHANNEL_ACCESS_TOKEN);
      const fileData = await LineuploadFileToDify(buffer, contentType, userId, DIFY_API_KEY_LINE);
      files = [fileData];

      if (!messageText) {
        messageText = "[Media received]";
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error("❌ media fetch error:", (err as any).response?.data || err.message);
      } else {
        console.error("❌ media fetch error:", err);
      }
    }

    const query = messageText.trim() || " ";
    const payload = {
      user: userId,
      response_mode: "blocking",
      inputs: { messageText: messageText || "" },
      query,
      ...(files.length && { files }),
    };

    console.log("📩 Dify payload:", JSON.stringify(payload, null, 2));

    try {
      await sendLoadingIndicatorToLINE(userId, LINE_CHANNEL_ACCESS_TOKEN);

      const difyResp = await axios.post(process.env.DIFY_WEBHOOK_URL || "", payload, {
        headers: { Authorization: `Bearer ${DIFY_API_KEY_LINE}` },
      });

      const answer =
        difyResp.data?.data?.outputs?.text?.trim() ||
        difyResp.data?.answer?.trim() ||
        difyResp.data?.message?.trim() ||
        "ขอโทษค่ะ ไม่สามารถตอบได้ในตอนนี้";

      console.log("📩 Dify response:", answer);

      await sendMessageToLINE(replyToken, answer, LINE_CHANNEL_ACCESS_TOKEN);

      res.status(200).send("OK");
    } catch (err) {
      if (err instanceof Error) {
        console.error("❌ media fetch error:", (err as any).response?.data || err.message);
      } else {
        console.error("❌ media fetch error:", err);
      }
    }
  }
};