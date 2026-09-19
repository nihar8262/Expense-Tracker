async function fetchWithBackoff(url, options, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }
      if (!response.ok) {
        throw new Error(`Gemini OCR API error: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

async function extractReceipt(images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  const parts = [
    {
      text: "Analyze the provided image(s). First, determine whether the image is actually a genuine financial receipt, store bill, restaurant check, invoice, or payment slip. If the image is a personal photo (such as a selfie, person, animal, nature, scenery, or unrelated non-bill object) or contains no financial transaction, set 'is_receipt' to false, provide a short 'error_message' (e.g. 'This image appears to be a personal photo, not a receipt or bill.'), and set amount to '0.00'. If it IS a receipt, set 'is_receipt' to true, extract transaction details, redact any credit card numbers with '[REDACTED]', and categorize into: Food, Travel, Utilities, Entertainment, Shopping, Healthcare, Others."
    }
  ];

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data // base64 string
      }
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const responseJson = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            is_receipt: { type: "BOOLEAN", description: "Set to true if image is a receipt/bill; false if it is a personal photo, selfie, object, or unrelated image." },
            error_message: { type: "STRING", description: "Reason why image is not a receipt if is_receipt is false." },
            merchant: { type: "STRING", description: "Name of the merchant/store." },
            amount: { type: "STRING", description: "Total amount spent as a decimal string, e.g., '12.50'." },
            date: { type: "STRING", description: "Date of transaction in YYYY-MM-DD format." },
            category: { type: "STRING", description: "Suggested category (Food, Travel, Utilities, Shopping, Entertainment, Healthcare, Others)." },
            description: { type: "STRING", description: "Concise summary of key items purchased." }
          },
          required: ["is_receipt"]
        }
      }
    })
  });

  const textResponse = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error("Failed to extract content from Gemini OCR response.");
  }

  const extractedData = JSON.parse(textResponse.trim());

  if (!extractedData.is_receipt) {
    const reason = extractedData.error_message?.trim() || "The uploaded image does not appear to be a receipt or bill.";
    throw new Error(`No receipt detected: ${reason} Please take or upload a clear photo of your receipt.`);
  }

  const parsedAmount = parseFloat(extractedData.amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("No receipt detected: Could not find a valid transaction amount on this image. Please take or upload a clear photo of your receipt.");
  }

  const redactCardNumbers = (val) => {
    if (typeof val === "string") {
      return val.replace(/\b(?:\d[ -]*?){12,19}\b/g, "[REDACTED]");
    }
    return val;
  };

  // Strip null bytes and non-printable control characters (except newlines/tabs),
  // then apply card-number redaction, then cap per-field lengths.
  const sanitizeField = (val, maxLen) => {
    if (typeof val !== "string") return val;
    const stripped = val
      .replace(/\0/g, "")
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return redactCardNumbers(stripped).slice(0, maxLen);
  };

  return {
    is_receipt: true,
    merchant: sanitizeField(extractedData.merchant || "Store", 100),
    amount: sanitizeField(extractedData.amount, 20),
    date: sanitizeField(extractedData.date || new Date().toISOString().slice(0, 10), 10),
    category: sanitizeField(extractedData.category || "Others", 64),
    description: sanitizeField(extractedData.description || "Receipt purchase", 280)
  };
}

module.exports = {
  extractReceipt
};
