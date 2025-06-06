export interface AdminUser {
  id: number;
  username: string;
  firstName: string | null; // firstName is optional
  lastName: string | null; // lastName is optional
  fullName: string;
  email: string;
  role: string;
  salaries: Array<{
    id: number;
    amount: number;
    month: string;
    year: number;
  }>;
}

export interface AdminProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
}

export interface AdminData {
  users: AdminUser[];
  products: AdminProduct[];
}