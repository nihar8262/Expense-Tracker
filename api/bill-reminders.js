const {
  createBillReminderForUser,
  deleteBillReminderForUser,
  listBillRemindersForUser,
  updateBillReminderForUser,
  getReminderPreferencesForUser,
  updateReminderPreferencesForUser
} = require("./_lib/finance");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  if (request.query.preferences === "true") {
    if (request.method === "GET") {
      const result = await getReminderPreferencesForUser(user.id);
      return sendResult(response, result);
    }

    if (request.method === "PUT") {
      const result = await updateReminderPreferencesForUser(user.id, request.body);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "GET, PUT");
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 0) {
    if (request.method === "GET") {
      const result = await listBillRemindersForUser(user.id);
      return sendResult(response, result);
    }

    if (request.method === "POST") {
      const result = await createBillReminderForUser(user.id, request.body);
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "GET, POST");
  }

  if (segments.length !== 1 || !segments[0]) {
    return notFound(response);
  }

  if (request.method === "PUT") {
    const result = await updateBillReminderForUser(user.id, segments[0], request.body);
    return sendResult(response, result);
  }

  if (request.method === "DELETE") {
    const result = await deleteBillReminderForUser(user.id, segments[0]);
    return sendResult(response, result);
  }

  return methodNotAllowed(response, "PUT, DELETE");
};