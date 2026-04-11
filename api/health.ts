import { handleHealthcheck } from "../backend/src/http.js";

export default async function handler(_request: unknown, response: {
  status(code: number): { json(payload: unknown): void };
}) {
  const result = await handleHealthcheck();
  return response.status(result.status).json(result.body);
}