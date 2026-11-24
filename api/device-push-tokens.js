const { registerDevicePushTokenForUser } = require("./_lib/finance");
const { authenticateUser, methodNotAllowed, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  try {
    const user = await authenticateUser(request, response);
    if (!user) return undefined;
    if (request.method !== "POST") return methodNotAllowed(response, "POST");
    const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
    if (!token || token.length > 4096) {
      return response.status(400).json({ error: "A valid device push token is required." });
    }
    return sendResult(response, await registerDevicePushTokenForUser(user.id, token));
  } catch (error) {
    console.error("Device push token handler error:", error);
    return response.status(500).json({ error: "Failed to register this device for notifications." });
  }
};
