const {
  AuthenticationConfigurationError,
  AuthenticationError,
  authenticateRequest,
  createBillReminderForUser,
  listBillRemindersForUser
} = require("./_lib/finance");

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

  if (request.method === "GET") {
    const result = await listBillRemindersForUser(user.id);
    return response.status(result.status).json(result.body);
  }

  if (request.method === "POST") {
    const result = await createBillReminderForUser(user.id, request.body);
    return response.status(result.status).json(result.body);
  }

  response.setHeader("Allow", "GET, POST");
  return response.status(405).end("Method Not Allowed");
};