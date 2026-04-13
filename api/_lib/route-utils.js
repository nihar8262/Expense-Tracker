const {
  AuthenticationConfigurationError,
  AuthenticationError,
  authenticateRequest
} = require("./finance");

function getPathSegments(request) {
  const requestUrl = typeof request.url === "string" ? request.url : "/";
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  return pathname.split("/").filter(Boolean);
}

async function authenticateUser(request, response) {
  try {
    return await authenticateRequest(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      response.status(401).json({ error: error.message });
      return null;
    }

    if (error instanceof AuthenticationConfigurationError) {
      response.status(500).json({ error: error.message });
      return null;
    }

    response.status(500).json({ error: "Failed to authenticate request." });
    return null;
  }
}

function sendResult(response, result) {
  if (result.body === null || typeof result.body === "undefined") {
    return response.status(result.status).end();
  }

  return response.status(result.status).json(result.body);
}

function methodNotAllowed(response, allow) {
  response.setHeader("Allow", allow);
  return response.status(405).end("Method Not Allowed");
}

function notFound(response) {
  return response.status(404).json({ error: "Not Found" });
}

module.exports = {
  authenticateUser,
  getPathSegments,
  methodNotAllowed,
  notFound,
  sendResult
};