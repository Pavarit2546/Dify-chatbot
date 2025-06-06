import { Request, Response } from "express";
import { fetchAdminInformation } from "../services/admin.service.js";
import { AdminData }  from "../types/admin.types.js";

export const getAdminInformation = async (req: Request, res: Response): Promise<void> => {
  try {
    const data: AdminData = await fetchAdminInformation();
    res.json(data);
  } catch (err: any) {
    console.error("❌ Admin fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch admin data" });
  }
};