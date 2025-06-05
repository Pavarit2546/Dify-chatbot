import express from "express";
import { prisma } from "../../app.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { salaries: true }
    });

    const products = await prisma.product.findMany({ take: 50 });

    const adminData = users.map((user) => ({
      user: {
        id: user.id,
        username: user.username,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
      },
      salaries: user.salaries.map(sal => ({
        id: sal.id,
        amount: sal.amount,
        month: sal.month,
        year: sal.year,
      })),
    }));

    res.json({
      users: adminData,
      products: products.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        stock: item.stock
      }))
    });
  } catch (err) {
    console.error("❌ Admin fetch error:", err);
    res.status(500).json({ error: "Failed to fetch admin data" });
  }
});

export default router;