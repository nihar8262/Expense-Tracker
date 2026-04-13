const {
  AuthenticationConfigurationError,
  AuthenticationError,
  authenticateRequest,
  deleteWalletExpenseForUser,
  updateWalletExpenseForUser
} = require("../../../_lib/finance");

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

  if (request.method === "PUT") {
    try {
      const result = await updateWalletExpenseForUser(user.id, request.query.walletId, request.query.expenseId, request.body);
      return response.status(result.status).json(result.body);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to update shared expense." });
    }
  }

  if (request.method === "DELETE") {
    try {
      const result = await deleteWalletExpenseForUser(user.id, request.query.walletId, request.query.expenseId);
      return response.status(result.status).json(result.body);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete shared expense." });
    }
  }

  response.setHeader("Allow", "PUT, DELETE");
  return response.status(405).end("Method Not Allowed");
};