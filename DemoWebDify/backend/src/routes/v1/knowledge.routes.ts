import express, { Router } from "express";
import { toKnowledgeHandler } from "../../controllers/knowledge.controller.js";

const router: Router= express.Router();

router.post("/to-knowledge", toKnowledgeHandler);

export default router;