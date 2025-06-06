import axios from "axios";
import FormData from "form-data";

const mimeToExt: Record<string, string> = {
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

export const verifyFacebookWebhook = (mode: string, token: string, challenge: string, FB_VERIFY_TOKEN: string): string | null => {
  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("✅ Facebook Webhook verified");
    return challenge;
  }
  return null;
};

export const sendTypingAction = async (senderId: string, FB_PAGE_TOKEN: string): Promise<void> => {
  await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${FB_PAGE_TOKEN}`, {
    recipient: { id: senderId },
    sender_action: "typing_on",
  });
};

export const FaceBookuploadFileToDify = async (url: string, senderId: string, DIFY_API_KEY: string): Promise<any> => {
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

  return {
    type: contentType.startsWith("image") ? "image" : "document",
    transfer_method: "local_file",
    upload_file_id: uploadRes.data.id,
  };
};

export const sendMessageToFacebook = async (senderId: string, message: string, FB_PAGE_TOKEN: string): Promise<void> => {
  await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${FB_PAGE_TOKEN}`, {
    recipient: { id: senderId },
    message: { text: message },
  });
};