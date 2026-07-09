const { createExpense, deleteExpense, listExpenses, updateExpense } = require("./_lib/personal-expenses");
const { runReminderChecksForUser } = require("./_lib/finance");
const { authenticateUser, getRoutedSegments, methodNotAllowed, notFound, sendResult } = require("./_lib/route-utils");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);

  if (!user) {
    return undefined;
  }

  // Consolidated receipts scanning handler
  if (request.query && request.query.receipts === "true") {
    if (request.method !== "POST") {
      return methodNotAllowed(response, "POST");
    }

    try {
      const { checkRateLimit } = require("./_lib/rate-limiter");
      const rateLimitKey = `scan:${user.id}`;
      const limitResult = await checkRateLimit(rateLimitKey, "scan");
      if (!limitResult.allowed) {
        return response.status(429).json({ error: "Too many scan requests. Please wait a minute before scanning again." });
      }
    } catch (err) {
      console.error("Rate limiter failure inside receipts handler:", err);
    }

    const { images } = request.body || {};
    if (!Array.isArray(images) || images.length === 0) {
      return response.status(400).json({ error: "Invalid payload: 'images' must be a non-empty array." });
    }

    if (images.length > 3) {
      return response.status(400).json({ error: "Max 3 images are allowed per single bill scan." });
    }

    const validatedImages = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img || typeof img.data !== "string" || typeof img.mimeType !== "string") {
        return response.status(400).json({ error: `Image at index ${i} is invalid. Required keys: 'data' (base64 string) and 'mimeType' (string).` });
      }
      const cleanMime = img.mimeType.toLowerCase().trim();
      if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(cleanMime)) {
        return response.status(400).json({ error: `Image at index ${i} has unsupported type: '${img.mimeType}'.` });
      }
      validatedImages.push({
        data: img.data,
        mimeType: cleanMime
      });
    }

    try {
      const { extractReceipt } = require("./_lib/gemini-ocr");
      const result = await extractReceipt(validatedImages);
      return response.status(200).json({ draft: result });
    } catch (error) {
      console.error("Receipt extraction failed:", error);
      return response.status(500).json({ error: error.message || "Failed to scan receipt image." });
    }
  }

  const segments = getRoutedSegments(request);

  if (segments.length === 0) {
    if (request.method === "GET") {
      const result = await listExpenses(request.query || {}, user.id);
      return sendResult(response, result);
    }

    if (request.method === "POST") {
      const headerValue = request.headers["idempotency-key"];
      const idempotencyKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      const result = await createExpense(request.body, idempotencyKey, user.id);
      if (result.status === 201) {
        runReminderChecksForUser(user.id).catch((error) => console.error("Background budget check failed.", error));
      }
      return sendResult(response, result);
    }

    return methodNotAllowed(response, "GET, POST");
  }

  if (segments.length !== 1 || !segments[0]) {
    return notFound(response);
  }

  const expenseId = segments[0];

  if (request.method === "PUT") {
    const result = await updateExpense(request.body, expenseId, user.id);
    return sendResult(response, result);
  }

  if (request.method === "DELETE") {
    const result = await deleteExpense(expenseId, user.id);
    return sendResult(response, result);
  }

  return methodNotAllowed(response, "PUT, DELETE");
};