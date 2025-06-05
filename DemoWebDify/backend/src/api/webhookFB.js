import express from "express";
import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";

const router = express.Router();
dotenv.config();

const DIFY_API_KEY = process.env.DIFY_API_KEY_FACEBOOK;
const DIFY_API_URL = process.env.DIFY_WEBHOOK_URL;
// Facebook
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("✅ Facebook Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

const mimeToExt = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

const tempSessions = new Map();
const SESSION_TIMEOUT = 3000;

setInterval(() => {
  const now = Date.now();
  for (const [senderId, session] of tempSessions.entries()) {
    const expired = now - session.lastUpdated >= SESSION_TIMEOUT;

    if (!expired || session.isProcessing) continue;

    const hasText = !!session.messageText;
    const hasFiles = session.files.length > 0;

    if (hasText || hasFiles) {
      session.isProcessing = true; // 🔒 ล็อก session ก่อนเริ่มส่ง
      tempSessions.set(senderId, session); // ต้องเซฟกลับเข้า Map ด้วย  
      // 🔄 เริ่ม loop ส่ง typing_on ทุก 2.5 วินาที
      const typingInterval = setInterval(() => {
        axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${FB_PAGE_TOKEN}`, {
          recipient: { id: senderId },
          sender_action: "typing_on",
        }).catch((err) => {
          console.error("❌ typing_on error:", err.message);
        });
      }, 2500);

      // 🧠 เรียก Dify API
      axios
        .post(
          DIFY_API_URL,
          {
            inputs: { messageText: session.messageText || "" },
            user: senderId,
            response_mode: "blocking",
            query: session.messageText || "ไฟล์แนบ",
            files: hasFiles ? session.files : [],
          },
          { headers: { Authorization: `Bearer ${DIFY_API_KEY}` } }
        )
        .then((difyResp) => {
          const answer =
            difyResp.data?.data?.outputs?.text?.trim() ||
            difyResp.data?.answer?.trim() ||
            "ขอโทษค่ะ ไม่สามารถตอบได้ในตอนนี้";

          // ✅ หยุด typing ก่อนตอบจริง
          clearInterval(typingInterval);

          return axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${FB_PAGE_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: answer },
            }
          );
        })
        .catch((err) => {
          clearInterval(typingInterval); // ✅ หยุด typing แม้เจอ error
          console.error("❌ Dify error:", err.response?.data || err.message);
        })
        .finally(() => {
          tempSessions.delete(senderId);
        });
    } else {
      tempSessions.delete(senderId);
    }
  }
}, 1000); // เช็คทุกวินาที

router.post("/", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event?.sender?.id;
      const message = event?.message;

      if (!senderId || !message) continue;

      try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${FB_PAGE_TOKEN}`, {
          recipient: { id: senderId },
          sender_action: "typing_on",
        });

        let session = tempSessions.get(senderId) || {
          messageText: null,
          files: [],
          lastUpdated: Date.now(),
          isProcessing: false,
        };

        // ⏩ ถ้ามีข้อความ ให้บันทึกไว้
        if (message.text) {
          session.messageText = message.text.trim();
        }

        // ⏩ ถ้ามีไฟล์แนบ
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            const url = attachment.payload.url;
            const type = attachment.type;

            const response = await axios.get(url, { responseType: "arraybuffer" });
            const contentType = response.headers["content-type"];
            const ext = mimeToExt[contentType] || "dat";
            const buffer = Buffer.from(response.data, "binary");

            const form = new FormData();
            form.append("file", buffer, {
              filename: `file.${ext}`,
              contentType,
            });
            form.append("user", senderId);

            const uploadRes = await axios.post("http://docker-nginx-1/v1/files/upload", form, {
              headers: {
                Authorization: `Bearer ${DIFY_API_KEY}`,
                ...form.getHeaders(),
              },
            });

            const uploadFileId = uploadRes.data.id;
            session.files.push({
              type: type === "image" ? "image" : "document",
              transfer_method: "local_file",
              upload_file_id: uploadFileId,
            });
          }
        }

        // ⏩ อัปเดตเวลาและเซฟ session กลับเข้า Map
        session.lastUpdated = Date.now();
        tempSessions.set(senderId, session);
      } catch (err) {
        console.error("❌ Messenger webhook error:", err.response?.data || err.message);
      }
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

export default router;