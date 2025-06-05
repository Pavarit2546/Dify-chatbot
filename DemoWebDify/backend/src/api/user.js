import express from "express";
import { prisma } from "../../app.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const results = await prisma.user.findMany({ take: 50 });
    res.json({
      records: results.map((item) => ({
        content: `User: ${item.username} (${item.firstName} ${item.lastName})`,
        score: 0.9,
        title: item.firstName || item.username,
        metadata: {
          email: item.email,
          role: item.role,
          username: item.username,
          firstName: item.firstName,
          lastName: item.lastName,
          source: "PostgreSQL"
        }
      }))
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id); // ✅ แปลงเป็น Int

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await prisma.user.findUnique({
      where: { id }, // ✅ id เป็น Int แล้ว
      include: {
        salaries: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user_id: user.id,
      username: user.username,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      salaries: user.salaries.map((sal) => ({
        id: sal.id,
        amount: sal.amount,
        month: sal.month,
        year: sal.year,
      }))
    });
  } catch (err) {
    console.error("User fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;