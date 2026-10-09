const { createFeedback, listUserFeedbacks, updateFeedback, deleteFeedback } = require("./_lib/banks-and-feedback");
const { authenticateUser, methodNotAllowed, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const { id } = request.query || {};

  if (request.method === "GET") {
    try {
      const result = await listUserFeedbacks(user.id);
      return sendResult(response, result);
    } catch (err) {
      console.error("Failed to list feedback:", err);
      return response.status(500).json({ error: "Failed to load feedback." });
    }
  }

  if (request.method === "POST") {
    try {
      const result = await createFeedback(request.body, user.id, user.email);
      return sendResult(response, result);
    } catch (err) {
      console.error("Failed to record feedback:", err);
      return response.status(500).json({ error: "Failed to record feedback." });
    }
  }

  if ((request.method === "PATCH" || request.method === "PUT") && id) {
    try {
      const result = await updateFeedback(request.body, id, user.id);
      return sendResult(response, result);
    } catch (err) {
      console.error("Failed to update feedback:", err);
      return response.status(500).json({ error: "Failed to update feedback." });
    }
  }

  if (request.method === "DELETE" && id) {
    try {
      const result = await deleteFeedback(id, user.id);
      return sendResult(response, result);
    } catch (err) {
      console.error("Failed to delete feedback:", err);
      return response.status(500).json({ error: "Failed to delete feedback." });
    }
  }

  return methodNotAllowed(response, "GET, POST, PATCH, PUT, DELETE");
};
