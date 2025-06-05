import express from "express";
import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";
import crypto from "crypto";

const router = express.Router();
dotenv.config();

const DIFY_API_KEY_LINE = process.env.DIFY_API_KEY_LINE;
const DIFY_API_URL = process.env.DIFY_WEBHOOK_URL;

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ตรวจสอบลายเซ็นจาก LINE
function verifySignature(bodyBuf, signature) {
    const hash = crypto
        .createHmac("sha256", LINE_CHANNEL_SECRET)
        .update(bodyBuf)
        .digest("base64");
    return hash === signature;
}

// รับ Webhook จาก LINE
router.post("/", async (req, res) => {
    const signature = req.headers["x-line-signature"];
    const rawBody = req.rawBody;

    if (!verifySignature(rawBody, signature)) {
        return res.status(401).send("Invalid signature");
    }

    let body;
    try {
        body = JSON.parse(rawBody.toString());
    } catch (err) {
        return res.status(400).send("Invalid JSON");
    }

    const events = body.events || [];
    if (!events.length) return res.status(200).send("No events");

    const { replyToken, message, source } = events[0];
    const userId = source.userId;

    if (!message || !message.type) {
        return res.status(200).send("Unsupported message");
    }

    let messageText = message.text || "";
    let files = null;
    const messageType = message.type;
    const supportedMediaTypes = ["image", "audio", "video", "file"];

    // กรณีแนบไฟล์: ดาวน์โหลดแล้วอัปโหลดไปยัง Dify
    if (supportedMediaTypes.includes(messageType)) {
        try {
            const mediaRes = await axios.get(
                `https://api-data.line.me/v2/bot/message/${message.id}/content`,
                {
                    headers: {
                        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                    },
                    responseType: "arraybuffer",
                }
            );

            const buffer = Buffer.from(mediaRes.data);
            const contentType = mediaRes.headers["content-type"];
            const ext = contentType.split("/")[1];

            const form = new FormData();
            form.append("file", buffer, {
                filename: `upload.${ext}`,
                contentType,
            });
            form.append("user", userId);

            const uploadRes = await axios.post(
                "http://docker-nginx-1/v1/files/upload",
                form,
                {
                    headers: {
                        Authorization: `Bearer ${DIFY_API_KEY_LINE}`,
                        ...form.getHeaders(),
                    },
                }
            );

            const uploadFileId = uploadRes.data.id;
            files = [
                {
                    type: messageType === "image" ? "image" : "document",
                    transfer_method: "local_file",
                    upload_file_id: uploadFileId,
                },
            ];

            // กรณีไม่มีข้อความ ให้ใส่ placeholder
            if (!messageText) {
                if (messageType === "image" || messageType === "audio") messageText = "";
                else messageText = "[Media received]";
            }
        } catch (err) {
            console.error("❌ media fetch error:", err.response?.data || err.message);
            return res.status(500).send("Media fetch error");
        }
    }

    const query = messageText.trim() || " ";

    const payload = {
        user: userId,
        response_mode: "blocking",
        inputs: { messageText: messageText || "" },
        query,
        ...(files && { files }),
    };

    console.log("📩 Dify payload:", JSON.stringify(payload, null, 2));

    try {
        // แจ้ง LINE ให้แสดง loading indicator (optional)
        await axios.post(
            "https://api.line.me/v2/bot/chat/loading/start",
            {
                chatId: userId,
                loadingSeconds: 20,
            },
            {
                headers: {
                    Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        // ส่งข้อมูลเข้า Dify
        const difyResp = await axios.post(DIFY_API_URL, payload, {
            headers: { Authorization: `Bearer ${DIFY_API_KEY_LINE}` },
        });

        const answer =
            difyResp.data?.data?.outputs?.text?.trim() ||
            difyResp.data?.answer?.trim() ||
            difyResp.data?.message?.trim() ||
            "ขอโทษค่ะ ไม่สามารถตอบได้ในตอนนี้";

        console.log("📩 Dify response:", answer);

        // ตอบกลับ LINE
        await axios.post(
            "https://api.line.me/v2/bot/message/reply",
            {
                replyToken,
                messages: [{ type: "text", text: answer }],
            },
            {
                headers: {
                    Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        res.status(200).send("OK");
    } catch (err) {
        console.error("❌ Dify or LINE reply error:", err.response?.data || err.message);
        res.status(500).send("Dify or LINE reply error");
    }
});

export default router;
