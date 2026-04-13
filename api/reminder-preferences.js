const {
  AuthenticationConfigurationError,
  AuthenticationError,
  authenticateRequest,
  getReminderPreferencesForUser,
  updateReminderPreferencesForUser
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
    const result = await getReminderPreferencesForUser(user.id);
    return response.status(result.status).json(result.body);
  }

  if (request.method === "PUT") {
    const result = await updateReminderPreferencesForUser(user.id, request.body);
    return response.status(result.status).json(result.body);
  }

  response.setHeader("Allow", "GET, PUT");
  return response.status(405).end("Method Not Allowed");
};