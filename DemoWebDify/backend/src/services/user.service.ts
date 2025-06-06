import { prisma } from "../prisma.js";

export const fetchUsers = async (): Promise<any[]> => {
  const results = await prisma.user.findMany({ take: 50 });
  return results.map((item) => ({
    content: `User: ${item.username} (${item.firstName} ${item.lastName})`,
    score: 0.9,
    title: item.firstName || item.username,
    metadata: {
      email: item.email,
      role: item.role,
      username: item.username,
      firstName: item.firstName,
      lastName: item.lastName,
      source: "PostgreSQL",
    },
  }));
};

export const fetchUserById = async (id: number): Promise<any | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { salaries: true },
  });

  if (!user) return null;

  return {
    user_id: user.id,
    username: user.username,
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    role: user.role,
    salaries: user.salaries.map((sal) => ({
      id: sal.id,
      amount: sal.amount,
      month: sal.date.toLocaleString("default", { month: "long" }), // ดึงเดือนจาก DateTime
      year: sal.date.getFullYear(), // ดึงปีจาก DateTime
    })),
  };
};