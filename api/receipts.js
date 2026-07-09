const { extractReceipt } = require("./_lib/gemini-ocr");
const { authenticateUser, methodNotAllowed, sendResult } = require("./_lib/route-utils");
const { checkRateLimit } = require("./_lib/rate-limiter");

module.exports = async function handler(request, response) {
  const user = await authenticateUser(request, response);
  if (!user) {
    return undefined;
  }

  if (request.method !== "POST") {
    return methodNotAllowed(response, "POST");
  }

  // Rate Limiting Check
  try {
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
    const result = await extractReceipt(validatedImages);
    return response.status(200).json({ draft: result });
  } catch (error) {
    console.error("Receipt extraction failed:", error);
    return response.status(500).json({ error: error.message || "Failed to scan receipt image." });
  }
};
