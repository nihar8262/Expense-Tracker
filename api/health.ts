export default async function handler(_request: unknown, response: {
  status(code: number): { json(payload: unknown): void };
}) {
  const { handleHealthcheck } = await import("../backend/src/http.js");
  const result = await handleHealthcheck();
  return response.status(result.status).json(result.body);
}