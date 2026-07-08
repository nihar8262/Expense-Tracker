const { handleAssistantQuery } = require("./_lib/assistant-service");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 1 && segments[0] === "query") {
    if (request.method !== "POST") {
      return methodNotAllowed(response, "POST");
    }

    try {
      const result = await handleAssistantQuery(request.body || {}, user.id);
      return sendResult(response, {
        status: 200,
        body: result
      });
    } catch (error) {
      console.error("Assistant service failed:", error);
      return response.status(500).json({ error: error.message || "Failed to process assistant query." });
    }
  }

  return notFound(response);
};
