import { Request, Response } from "express";
import { fetchUsers, fetchUserById } from "../services/user.service.js";

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const records = await fetchUsers();
    res.json({ records });
  } catch (err: any) {
    console.error("Failed to fetch users:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const user = await fetchUserById(id);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (err: any) {
    console.error("Failed to fetch user by ID:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};