import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";

export const verifySignature = (bodyBuf: Buffer, signature: string, LINE_CHANNEL_SECRET: string): boolean => {
  const hash = crypto.createHmac("sha256", LINE_CHANNEL_SECRET).update(bodyBuf).digest("base64");
  return hash === signature;
};

export const fetchMediaFromLINE = async (messageId: string, LINE_CHANNEL_ACCESS_TOKEN: string): Promise<{ buffer: Buffer; contentType: string }> => {
  const mediaRes = await axios.get(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    responseType: "arraybuffer",
  });

  const buffer = Buffer.from(mediaRes.data);
  const contentType = mediaRes.headers["content-type"];
  return { buffer, contentType };
};

export const LineuploadFileToDify = async (buffer: Buffer, contentType: string, userId: string, DIFY_API_KEY_LINE: string): Promise<any> => {
  const ext = contentType.split("/")[1];
  const form = new FormData();
  form.append("file", buffer, { filename: `upload.${ext}`, contentType });
  form.append("user", userId);

  const uploadRes = await axios.post("http://docker-nginx-1/v1/files/upload", form, {
    headers: { Authorization: `Bearer ${DIFY_API_KEY_LINE}`, ...form.getHeaders() },
  });

  return {
    type: contentType.startsWith("image") ? "image" : "document",
    transfer_method: "local_file",
    upload_file_id: uploadRes.data.id,
  };
};

export const sendMessageToLINE = async (replyToken: string, message: string, LINE_CHANNEL_ACCESS_TOKEN: string): Promise<void> => {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages: [{ type: "text", text: message }] },
    { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
  );
};

export const sendLoadingIndicatorToLINE = async (userId: string, LINE_CHANNEL_ACCESS_TOKEN: string): Promise<void> => {
  await axios.post(
    "https://api.line.me/v2/bot/chat/loading/start",
    { chatId: userId, loadingSeconds: 20 },
    { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
  );
};