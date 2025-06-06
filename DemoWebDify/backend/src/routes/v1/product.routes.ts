import express, { Router } from "express";
import { getProducts, createProductKnowledge } from "../../controllers/product.controller.js";

const router: Router = express.Router();

router.get("/", getProducts);
router.post("/to-knowledge", createProductKnowledge);

export default router;