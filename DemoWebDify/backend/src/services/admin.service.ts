import { prisma } from "../prisma.js";
import { AdminData, AdminUser, AdminProduct } from "../types/admin.types.js";

export const fetchAdminInformation = async (): Promise<AdminData> => {
  const users = await prisma.user.findMany({
    include: { salaries: true },
  });

  const products = await prisma.product.findMany({ take: 50 });

  const adminData: AdminUser[] = users.map((user) => ({
    id: user.id,
    username: user.username,
    firstName: user.firstName || "", // กำหนดค่า default หากเป็น null
    lastName: user.lastName || "",  // กำหนดค่า default หากเป็น null
    fullName: `${user.firstName || ""} ${user.lastName || ""}`, // รวมค่า fullName
    email: user.email,
    role: user.role,
    salaries: user.salaries.map((sal) => ({
      id: sal.id,
      amount: sal.amount,
      month: sal.date.toISOString().split("-")[1],
      year: sal.date.getFullYear(),
    })),
  }));

  return {
    users: adminData,
    products: products.map((item: any): AdminProduct => ({
      id: item.id,
      name: item.name,
      price: item.price,
      stock: item.stock,
    })),
  };
};