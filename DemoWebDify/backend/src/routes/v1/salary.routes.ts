import express, { Router } from "express";
import { getSalaries, syncSalaryToFirebaseRetrieval } from "../../controllers/salary.controller.js";

const router: Router = express.Router();

router.get("/", getSalaries);
router.post("/sync-salary-to-firebase/retrieval", syncSalaryToFirebaseRetrieval);

export default router;