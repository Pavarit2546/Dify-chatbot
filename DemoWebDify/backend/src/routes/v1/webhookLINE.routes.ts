import express, { Router } from "express";
import { handleLINEWebhook } from "../../controllers/webhookLINE.controller.js";

const router: Router = express.Router();

router.post("/", handleLINEWebhook);

export default router;