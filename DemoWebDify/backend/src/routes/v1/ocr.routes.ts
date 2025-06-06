import express, { Router } from "express";
import upload from "../../middlewares/upload.js";
import { ocrImage, cleanDoc, getLastCleanDoc } from "../../controllers/ocr.controller.js";

const router: Router = express.Router();

router.post("/", upload.single("file"), ocrImage); // OCR image endpoint
router.post("/clean-doc", cleanDoc); // Clean document endpoint
router.get("/clean-doc/last", getLastCleanDoc); // Get last cleaned document

export default router;