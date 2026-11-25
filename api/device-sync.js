const { getDeviceSyncPage } = require("./_lib/device-sync");
const { authenticateUser, methodNotAllowed, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);
  if (!user) return undefined;
  if (request.method !== "GET") return methodNotAllowed(response, "GET");
  try {
    return sendResult(response, await getDeviceSyncPage(user.id, request.query?.cursor, request.query?.limit));
  } catch (error) {
    console.error("Device sync feed failed.", error);
    return response.status(500).json({ error: "Failed to load device changes." });
  }
};
