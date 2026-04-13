const {
  deleteNotificationForUser,
  linkWalletInvitesForUser,
  listNotificationsForUser,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
  runReminderChecksForUser
} = require("./_lib/finance");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 0) {
    if (request.method === "GET") {
      try {
        await linkWalletInvitesForUser(user);
      } catch (error) {
        console.error("Failed to sync wallet invite notifications.", error);
      }
      const result = await listNotificationsForUser(user.id);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "GET");
  }

  if (segments.length === 1 && segments[0] === "read-all") {
    if (request.method === "POST") {
      const result = await markAllNotificationsReadForUser(user.id);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "POST");
  }

  if (segments.length === 1 && segments[0] === "run-checks") {
    if (request.method === "POST") {
      const result = await runReminderChecksForUser(user.id);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "POST");
  }

  if (segments.length === 1 && segments[0]) {
    if (request.method === "DELETE") {
      const result = await deleteNotificationForUser(user.id, segments[0]);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "DELETE");
  }

  if (segments.length === 2 && segments[1] === "read") {
    if (request.method === "PATCH") {
      const result = await markNotificationReadForUser(user.id, segments[0]);
      return sendResult(response, result);
    }

    if (request.method === "DELETE") {
      const result = await deleteNotificationForUser(user.id, segments[0]);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "PATCH, DELETE");
  }

  return notFound(response);
};