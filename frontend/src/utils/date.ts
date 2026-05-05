export function getTodayIsoDate(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
}

export function getCurrentMonthValue(baseDate = new Date()): string {
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;
}

export function getExpenseMonth(expenseDate: string): string {
  return expenseDate.slice(0, 7);
}

export function getMonthValueWithOffset(baseMonth: string, offset: number): string {
  const [year, month] = baseMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getStartOfWeek(date: Date): Date {
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const offset = day === 0 ? 6 : day - 1;
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - offset);
  return startOfWeek;
}

export function getIsoDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
