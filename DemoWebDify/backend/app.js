import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import ocrRoutes from "./src/api/ocr.js";
import textChunkRoutes from "./src/api/textChunks.js";
import syncRoutes from "./src/api/sync.js";
import userRoutes from "./src/api/user.js";
import salaryRoutes from "./src/api/salary.js";
import adminRoutes from "./src/api/admin.js";
import productRoutes from "./src/api/product.js";
import webhookFB from "./src/api/webhookFB.js";
import webhookLINE from "./src/api/webhookLINE.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

export const prisma = new PrismaClient();

app.use(cors({origin: '*'}));
// app.use(express.json({ limit: "10mb" }));
// app.use(express.text({ type: '*/*', limit: '100mb' }));
// app.use(express.urlencoded({ extended: true }));

app.use("/ocr", ocrRoutes);
app.use("/text-chunks", express.json({ limit: "10mb" }), textChunkRoutes);
app.use("/sync-to-dify", express.text({ type: '*/*', limit: '100mb' }), syncRoutes);
app.use("/user", express.json(), userRoutes);
app.use("/salary", express.json(), salaryRoutes);
app.use("/admin", express.json(), adminRoutes);
app.use("/product", express.json(), productRoutes);
app.use("/webhookFB", express.json(), webhookFB);
app.use("/webhookLINE",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  },
  webhookLINE
);


app.listen(PORT, '0.0.0.0',() => {
  console.log(`🚀 Server running on port ${PORT}`);
});