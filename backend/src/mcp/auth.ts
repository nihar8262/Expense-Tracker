import type { Request } from "express";
import type { TokenStore } from "./tokenStore.js";

export class McpAuthenticationError extends Error {
  constructor(message = "Unauthorized: Invalid or missing token.") {
    super(message);
    this.name = "McpAuthenticationError";
  }
}

export async function authenticateMcpRequest(request: Request, tokenStore: TokenStore): Promise<{ id: string }> {
  let token: string | null = null;

  const authHeader = request.headers["authorization"] || request.headers["Authorization"];
  if (authHeader && typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.substring(7).trim();
  }

  if (!token && request.query && typeof request.query.token === "string") {
    token = request.query.token;
  }

  if (!token) {
    throw new McpAuthenticationError("Unauthorized: Missing access token.");
  }

  const userId = await tokenStore.authenticateToken(token);
  if (!userId) {
    throw new McpAuthenticationError("Unauthorized: Invalid or revoked access token.");
  }

  return { id: userId };
}
