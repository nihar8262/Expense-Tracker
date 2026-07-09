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
      text: "Extract transaction details from the provided receipt image(s). If multiple images are provided, they belong to the same single receipt; sum and analyze them together as one transaction. Redact any sensitive credit card numbers or account numbers (replace with '[REDACTED]'). Suggest a category matching one of: Food, Travel, Utilities, Entertainment, Shopping, Healthcare, Others."
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
            merchant: { type: "STRING", description: "Name of the merchant/store." },
            amount: { type: "STRING", description: "Total amount spent as a decimal string, e.g., '12.50'." },
            date: { type: "STRING", description: "Date of transaction in YYYY-MM-DD format." },
            category: { type: "STRING", description: "Suggested category (e.g. Food, Travel, Utilities, Shopping, Entertainment, Healthcare, Others)." },
            description: { type: "STRING", description: "Concise summary of key items purchased." }
          },
          required: ["merchant", "amount", "date", "category", "description"]
        }
      }
    })
  });

  const textResponse = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error("Failed to extract content from Gemini OCR response.");
  }

  const extractedData = JSON.parse(textResponse.trim());

  const redact = (val) => {
    if (typeof val === "string") {
      return val.replace(/\b(?:\d[ -]*?){12,19}\b/g, "[REDACTED]");
    }
    return val;
  };

  return {
    merchant: redact(extractedData.merchant),
    amount: redact(extractedData.amount),
    date: redact(extractedData.date),
    category: redact(extractedData.category),
    description: redact(extractedData.description)
  };
}

module.exports = {
  extractReceipt
};
