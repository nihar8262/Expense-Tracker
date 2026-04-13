const {
  AuthenticationConfigurationError,
  AuthenticationError,
  authenticateRequest,
  createWalletSettlementForUser,
  deleteWalletSettlementForUser,
  updateWalletSettlementForUser
} = require("../../_lib/finance");

module.exports = async function handler(request, response) {
  let user;

  try {
    user = await authenticateRequest(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return response.status(401).json({ error: error.message });
    }

    if (error instanceof AuthenticationConfigurationError) {
      return response.status(500).json({ error: error.message });
    }

    return response.status(500).json({ error: "Failed to authenticate request." });
  }

  if (request.method === "POST") {
    try {
      const result = await createWalletSettlementForUser(user.id, request.query.walletId, request.body);
      return response.status(result.status).json(result.body);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to record settlement." });
    }
  }

  if (request.method === "PUT") {
    return response.status(405).json({ error: "Settlement id is required." });
  }

  if (request.method === "DELETE") {
    return response.status(405).json({ error: "Settlement id is required." });
  }

  response.setHeader("Allow", "POST");
  return response.status(405).end("Method Not Allowed");
};