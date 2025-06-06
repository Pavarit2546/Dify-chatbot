import { Request } from "express";

declare module "express" {
    export interface Request {
        file?: Express.Multer.File; // เพิ่ม file ใน Request
    }
}

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer; // เพิ่ม rawBody ใน Request
  }
}