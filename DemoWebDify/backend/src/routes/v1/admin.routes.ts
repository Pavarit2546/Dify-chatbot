import express, { Router } from "express";
import { getAdminInformation } from "../../controllers/admin.controller.js";

const router: Router = express.Router();

router.get("/", getAdminInformation);

export default router;