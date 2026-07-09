import crypto from "node:crypto";

async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3): Promise<any> {
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
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
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

export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const responseJson = await fetchWithBackoff(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: {
        parts: [{ text }]
      },
      outputDimensionality: 768
    })
  });

  const values = responseJson?.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error("Invalid embedding response from Gemini API.");
  }
  return values.slice(0, 768);
}

export function calculateHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
