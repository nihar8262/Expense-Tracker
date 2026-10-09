const { listBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount } = require("./_lib/banks-and-feedback");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  // /api/profile/banks or /api/profile/banks/:bankAccountId
  if (segments.length === 0 || segments[0] !== "banks") {
    return notFound(response);
  }

  // /api/profile/banks
  if (segments.length === 1) {
    if (request.method === "GET") {
      try {
        const result = await listBankAccounts(user.id);
        return sendResult(response, result);
      } catch (err) {
        console.error("Failed to list bank accounts:", err);
        return response.status(500).json({ error: "Failed to list bank accounts." });
      }
    }

    if (request.method === "POST") {
      try {
        const result = await createBankAccount(request.body, user.id);
        return sendResult(response, result);
      } catch (err) {
        console.error("Failed to create bank account:", err);
        return response.status(500).json({ error: "Failed to create bank account." });
      }
    }

    return methodNotAllowed(response, "GET, POST");
  }

  // /api/profile/banks/:bankAccountId
  if (segments.length === 2 && segments[1]) {
    const bankAccountId = segments[1];

    if (request.method === "PATCH" || request.method === "PUT") {
      try {
        const result = await updateBankAccount(request.body, bankAccountId, user.id);
        return sendResult(response, result);
      } catch (err) {
        console.error("Failed to update bank account:", err);
        return response.status(500).json({ error: "Failed to update bank account." });
      }
    }

    if (request.method === "DELETE") {
      try {
        const result = await deleteBankAccount(bankAccountId, user.id);
        return sendResult(response, result);
      } catch (err) {
        console.error("Failed to delete bank account:", err);
        return response.status(500).json({ error: "Failed to delete bank account." });
      }
    }

    return methodNotAllowed(response, "PATCH, PUT, DELETE");
  }

  return notFound(response);
};
