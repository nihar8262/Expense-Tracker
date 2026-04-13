const { runReminderChecks, runReminderChecksForUser } = require("../_lib/finance");
const { authenticateUser, getPathSegments, methodNotAllowed, notFound, sendResult } = require("../_lib/route-utils");

module.exports = async function handler(request, response) {
  const segments = getPathSegments(request).slice(2);

  if (segments.length !== 2 || segments[0] !== "reminders" || segments[1] !== "run") {
    return notFound(response);
  }

  const schedulerSecret = process.env.SCHEDULER_SECRET && process.env.SCHEDULER_SECRET.trim();
  const providedSecret = request.headers["x-scheduler-secret"] && String(request.headers["x-scheduler-secret"]).trim();

  if (schedulerSecret && providedSecret === schedulerSecret) {
    const result = await runReminderChecks();
    return sendResult(response, result);
  }

  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  if (request.method === "POST") {
    const result = await runReminderChecksForUser(user.id);
    return sendResult(response, result);
  }

  return methodNotAllowed(response, "POST");
};