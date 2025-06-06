import { prisma } from "../prisma.js";
import axios from "axios";
import config from "../config/config.js";

const VALID_API_KEY = config.varidExternalApiKey;

export const fetchSalaries = async (): Promise<any[]> => {
  const results = await prisma.salary.findMany({
    take: 50,
    include: { user: true },
  });
  return results;
};

export const syncSalaryToFirebase = async (knowledgeId: number, cleanedData: any[]): Promise<void> => {
  const firebaseUrl = `https://dify-chatflow-default-rtdb.firebaseio.com/knowledge/${knowledgeId}.json?auth=${VALID_API_KEY}`;
  await axios.put(firebaseUrl, cleanedData);
};

export const retrieveSalaryData = async (
  query: string,
  cleanedData: any[],
  topK: number,
  scoreThreshold: number
): Promise<any[]> => {
  const matches = cleanedData
    .map((item) => {
      if (!item || !item.user) return null;

      const fullName = `${item.user.firstName} ${item.user.lastName}`.toLowerCase();
      const email = item.user.email.toLowerCase();
      const role = item.user.role.toLowerCase();
      const q = query?.toLowerCase() || "";

      const isMatch = fullName.includes(q) || email.includes(q) || role.includes(q);
      const score = isMatch ? 1.0 : 0.0;

      return {
        id: item.id,
        name: `${item.user.firstName} ${item.user.lastName}`,
        email: item.user.email,
        role: item.user.role,
        salary: item.amount,
        date: item.date,
        score,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null) // กรอง null ออก
    .sort((a, b) => b.score - a.score);
  return matches.slice(0, topK);
};