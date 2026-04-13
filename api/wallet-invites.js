const { respondToWalletInvite } = require("./_lib/finance");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 2 && segments[0] && segments[1] === "respond") {
    if (request.method === "POST") {
      const result = await respondToWalletInvite(user, segments[0], request.body);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "POST");
  }

  return notFound(response);
};