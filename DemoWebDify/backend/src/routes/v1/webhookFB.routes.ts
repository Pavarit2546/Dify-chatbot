import express, { Router } from "express";
import { verifyWebhook, handleWebhookEvent } from "../../controllers/webhookFB.controller.js";

const router: Router = express.Router();

router.get("/", verifyWebhook);
router.post("/", handleWebhookEvent);

export default router;