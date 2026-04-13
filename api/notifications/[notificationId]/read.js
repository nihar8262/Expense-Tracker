const {
  AuthenticationConfigurationError,
  AuthenticationError,
  authenticateRequest,
  deleteNotificationForUser,
  markNotificationReadForUser
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

  if (request.method === "PATCH") {
    const result = await markNotificationReadForUser(user.id, request.query.notificationId);
    return response.status(result.status).json(result.body);
  }

  if (request.method === "DELETE") {
    const result = await deleteNotificationForUser(user.id, request.query.notificationId);
    if (result.body === null) {
      return response.status(result.status).end();
    }
    return response.status(result.status).json(result.body);
  }

  response.setHeader("Allow", "PATCH, DELETE");
  return response.status(405).end("Method Not Allowed");
};