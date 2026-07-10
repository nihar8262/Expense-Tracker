import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";

// Mock the Gemini OCR service so we don't hit the real API
vi.mock("../src/mcp/geminiOcr.js", () => {
  return {
    extractReceipt: vi.fn().mockResolvedValue({
      merchant: "Starbucks",
      amount: "4.50",
      date: "2026-07-09",
      category: "Food",
      description: "Matcha Latte"
    })
  };
});

function buildApp() {
  return createApp(
    createMemoryExpenseStore(),
    async (authorizationHeader) => {
      const userId = authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
      if (!userId) {
        throw new Error("Missing test user.");
      }
      return { id: userId, email: `${userId}@example.com`, name: userId, picture: null };
    },
    async () => {}
  );
}

describe("Receipts OCR API Router", () => {
  it("rejects request if images array is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-one")
      .send({});
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("images");
  });

  it("rejects request if images array has more than 3 items", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-one")
      .send({
        images: [
          { data: "base64", mimeType: "image/jpeg" },
          { data: "base64", mimeType: "image/jpeg" },
          { data: "base64", mimeType: "image/jpeg" },
          { data: "base64", mimeType: "image/jpeg" }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Max 3");
  });

  it("accepts valid images payload and returns structured draft", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-one")
      .send({
        images: [
          // Minimal JPEG: starts with FF D8 FF magic bytes (base64: /9j/)
          { data: "/9j/4AAQSkZJRgABAQ==", mimeType: "image/jpeg" }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.draft).toBeDefined();
    expect(res.body.draft.merchant).toBe("Starbucks");
    expect(res.body.draft.amount).toBe("4.50");
  });
});
