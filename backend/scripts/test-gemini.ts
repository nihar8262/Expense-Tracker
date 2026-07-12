import dotenv from "dotenv";
import { getEmbedding } from "../src/mcp/geminiEmbeddings.js";

dotenv.config({ path: "../.env" });

async function test() {
  try {
    console.log("Testing Gemini Embeddings API...");
    const vector = await getEmbedding("biscuit or cookies");
    console.log("Success! Embedding generated successfully. Vector length:", vector.length);
    console.log("First 5 dimensions:", vector.slice(0, 5));
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
