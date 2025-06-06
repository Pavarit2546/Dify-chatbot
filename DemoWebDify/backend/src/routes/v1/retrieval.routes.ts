import express, { Router } from "express";
import { externalKnowledgeRetrieval } from "../../controllers/retrieval.controller.js";

const router: Router = express.Router();

router.post("/retrieval", externalKnowledgeRetrieval);

export default router;