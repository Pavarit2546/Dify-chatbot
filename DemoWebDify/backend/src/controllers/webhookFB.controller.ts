import { Request, Response } from "express";
import {
    verifyFacebookWebhook,
    sendTypingAction,
    FaceBookuploadFileToDify,
    sendMessageToFacebook,
} from "../services/webhookFB.service.js";

const tempSessions = new Map<string, any>();
const SESSION_TIMEOUT = 3000;

setInterval(() => {
    const now = Date.now();
    for (const [senderId, session] of tempSessions.entries()) {
        if (now - session.lastUpdated >= SESSION_TIMEOUT) {
            tempSessions.delete(senderId); // ลบ session ที่หมดเวลา
        }
    }
}, 1000);

export const verifyWebhook = (req: Request, res: Response): void => {
    const mode = req.query["hub.mode"] as string;
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;

    const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "";

    const result = verifyFacebookWebhook(mode, token, challenge, FB_VERIFY_TOKEN);
    if (result) {
        res.status(200).send(result);
    } else {
        res.sendStatus(403);
    }
};

export const handleWebhookEvent = async (req: Request, res: Response): Promise<void> => {
    const body = req.body;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
    const DIFY_API_KEY = process.env.DIFY_API_KEY_FACEBOOK || "";

    if (body.object === "page") {
        for (const entry of body.entry) {
            const event = entry.messaging[0];
            const senderId = event?.sender?.id;
            const message = event?.message;

            if (!senderId || !message) continue;

            await sendTypingAction(senderId, FB_PAGE_TOKEN);

            let session = tempSessions.get(senderId) || {
                messageText: null,
                files: [],
                lastUpdated: Date.now(),
                isProcessing: false,
            };

            if (message.text) {
                session.messageText = message.text.trim();
            }

            if (message.attachments && message.attachments.length > 0) {
                for (const attachment of message.attachments) {
                    const fileData = await FaceBookuploadFileToDify(attachment.payload.url, senderId, DIFY_API_KEY);
                    session.files.push(fileData);
                }
            }

            session.lastUpdated = Date.now();
            tempSessions.set(senderId, session);

            if (session.messageText) {
                const responseMessage = `ข้อความที่ได้รับ: ${session.messageText}`;
                await sendMessageToFacebook(senderId, responseMessage, FB_PAGE_TOKEN);
            }
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
};