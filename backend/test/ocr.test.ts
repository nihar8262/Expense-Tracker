import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";

// Mock the Gemini OCR service so we don't hit the real API
vi.mock("../src/mcp/geminiOcr.js", () => {
  return {
    extractReceipt: vi.fn().mockResolvedValue({
      is_receipt: true,
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
      return { id: userId, email: `${userId}@example.com`, name: userId, picture: null, emailVerified: true };
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

  it("rejects WAV audio masquerading as WebP and accepts valid WebP", async () => {
    const app = buildApp();
    // WAV has RIFF at 0-3 and WAVE at 8-11
    const wavBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    const wavRes = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-webp")
      .send({
        images: [{ data: wavBuf.toString("base64"), mimeType: "image/webp" }]
      });
    expect(wavRes.status).toBe(400);
    expect(wavRes.body.error).toContain("does not match declared type");

    // WebP has RIFF at 0-3 and WEBP at 8-11
    const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38]);
    const webpRes = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-webp")
      .send({
        images: [{ data: webpBuf.toString("base64"), mimeType: "image/webp" }]
      });
    expect(webpRes.status).toBe(200);
  });

  it("validates full 8-byte PNG signature", async () => {
    const app = buildApp();
    // Incomplete PNG: only first 4 bytes (89 50 4E 47) followed by garbage
    const partialPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const failRes = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-png")
      .send({
        images: [{ data: partialPng.toString("base64"), mimeType: "image/png" }]
      });
    expect(failRes.status).toBe(400);
    expect(failRes.body.error).toContain("does not match declared type");

    // Full 8-byte PNG: 89 50 4E 47 0D 0A 1A 0A
    const fullPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const passRes = await request(app)
      .post("/api/receipts")
      .set("Authorization", "Bearer user-png")
      .send({
        images: [{ data: fullPng.toString("base64"), mimeType: "image/png" }]
      });
    expect(passRes.status).toBe(200);
  });
});
