const { createBudget, deleteBudget, listBudgets, updateBudget } = require("./_lib/personal-budgets");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 0) {
    if (request.method === "GET") {
      try {
        const result = await listBudgets(user.id);
        return sendResult(response, result);
      } catch {
        return response.status(500).json({ error: "Failed to load budgets." });
      }
    }

    if (request.method === "POST") {
      try {
        const result = await createBudget(request.body, user.id);
        return sendResult(response, result);
      } catch {
        return response.status(500).json({ error: "Failed to create budget." });
      }
    }

    return methodNotAllowed(response, "GET, POST");
  }

  if (segments.length !== 1 || !segments[0]) {
    return notFound(response);
  }

  const budgetId = segments[0];

  if (request.method === "PUT") {
    try {
      const result = await updateBudget(request.body, budgetId, user.id);
      return sendResult(response, result);
    } catch {
      return response.status(500).json({ error: "Failed to update budget." });
    }
  }

  if (request.method === "DELETE") {
    try {
      const result = await deleteBudget(budgetId, user.id);
      return sendResult(response, result);
    } catch {
      return response.status(500).json({ error: "Failed to delete budget." });
    }
  }

  return methodNotAllowed(response, "PUT, DELETE");
};