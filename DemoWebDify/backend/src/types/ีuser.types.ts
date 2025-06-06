type UserType = {
  id: number;
  name: string;
  email: string;
  salaries: SalaryType[];
};
type SalaryType = {
  id: number;
  amount: number;
  month: string;
  year: number;
};