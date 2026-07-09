import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";
import { MemoryRateLimiter, getRateLimiter } from "../src/mcp/rateLimiter.js";

// Mock the assistant query service so we don't hit the real LLM
vi.mock("../src/assistant/assistantService.js", () => {
  return {
    handleAssistantQuery: vi.fn().mockResolvedValue({ answer: "mocked response" })
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

describe("MemoryRateLimiter Unit Tests", () => {
  it("implements token bucket rate limiting rules correctly", async () => {
    const limiter = new MemoryRateLimiter();

    // 1. Initial requests up to chat limit (10)
    for (let i = 0; i < 10; i++) {
      const res = await limiter.checkRateLimit("user-1", "chat");
      expect(res.allowed).toBe(true);
    }

    // 2. The 11th request must be rate limited
    const resBlocked = await limiter.checkRateLimit("user-1", "chat");
    expect(resBlocked.allowed).toBe(false);

    // 3. Different key is not affected
    const resUser2 = await limiter.checkRateLimit("user-2", "chat");
    expect(resUser2.allowed).toBe(true);
  });
});

describe("Rate Limiter HTTP Integration", () => {
  it("enforces rate limits on assistant query endpoint and returns 429", async () => {
    const app = buildApp();
    const rateLimiter = getRateLimiter();
    if ("clear" in rateLimiter) {
      (rateLimiter as any).clear();
    }

    // Chat limit is 10 requests. We send 10 valid requests
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/assistant/query")
        .set("Authorization", "Bearer user-b")
        .send({ messages: [] });
      expect(res.status).toBe(200);
      expect(res.body.answer).toBe("mocked response");
    }

    // The 11th query must return 429
    const resBlocked = await request(app)
      .post("/api/assistant/query")
      .set("Authorization", "Bearer user-b")
      .send({ messages: [] });
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.body.error).toContain("Too many messages");
  });
});
