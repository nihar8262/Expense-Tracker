const { authenticateToken } = require("./account-tokens");

class McpAuthenticationError extends Error {
  constructor(message = "Unauthorized: Invalid or missing token.") {
    super(message);
    this.name = "McpAuthenticationError";
  }
}

async function authenticateMcpRequest(request) {
  let token = null;

  const authHeader = request.headers["authorization"] || request.headers["Authorization"];
  if (authHeader && typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.substring(7).trim();
  }

  if (!token && request.query && request.query.token) {
    token = request.query.token;
  }

  if (!token) {
    throw new McpAuthenticationError("Unauthorized: Missing access token.");
  }

  const userId = await authenticateToken(token);
  if (!userId) {
    throw new McpAuthenticationError("Unauthorized: Invalid or revoked access token.");
  }

  return { id: userId };
}

module.exports = {
  McpAuthenticationError,
  authenticateMcpRequest
};
