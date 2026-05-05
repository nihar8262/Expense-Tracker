const { createExpense, deleteExpense, listExpenses, updateExpense } = require("./_lib/personal-expenses");
const { runReminderChecksForUser } = require("./_lib/finance");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 0) {
    if (request.method === "GET") {
      const result = await listExpenses(request.query || {}, user.id);
      return sendResult(response, result);
    }

    if (request.method === "POST") {
      const headerValue = request.headers["idempotency-key"];
      const idempotencyKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      const result = await createExpense(request.body, idempotencyKey, user.id);
      if (result.status === 201) {
        runReminderChecksForUser(user.id).catch((error) => console.error("Background budget check failed.", error));
      }
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "GET, POST");
  }

  if (segments.length !== 1 || !segments[0]) {
    return notFound(response);
  }

  const expenseId = segments[0];

  if (request.method === "PUT") {
    const result = await updateExpense(request.body, expenseId, user.id);
    return sendResult(response, result);
  }

  if (request.method === "DELETE") {
    const result = await deleteExpense(expenseId, user.id);
    return sendResult(response, result);
  }

  return methodNotAllowed(response, "PUT, DELETE");
};