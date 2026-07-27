import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";

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

describe("assistant streaming API", () => {
  it("streams responses with event-stream headers", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/assistant/stream")
      .set("Authorization", "Bearer user-one")
      .send({
        messages: [
          { role: "user", content: "Who is the president of America?" }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.text).toContain("data: ");
  }, 60000);
});
