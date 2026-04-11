import { createPostgresExpenseStore } from "../backend/src/store/postgres.js";
import { handleCreateExpense, handleListExpenses } from "../backend/src/http.js";

const store = createPostgresExpenseStore();

export default async function handler(request: {
  method?: string;
  body?: unknown;
  query?: unknown;
  headers: Record<string, string | string[] | undefined>;
}, response: {
  status(code: number): { json(payload: unknown): void; end(payload?: string): void };
  setHeader(name: string, value: string): void;
}) {
  if (request.method === "GET") {
    const result = await handleListExpenses(request.query ?? {}, store);
    return response.status(result.status).json(result.body);
  }

  if (request.method === "POST") {
    const headerValue = request.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const result = await handleCreateExpense(request.body, idempotencyKey?.trim(), store);
    return response.status(result.status).json(result.body);
  }

  response.setHeader("Allow", "GET, POST");
  return response.status(405).end("Method Not Allowed");
}