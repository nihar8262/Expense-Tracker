import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";

function buildApp() {
  return createApp(createMemoryExpenseStore());
}

describe("expenses API", () => {
  it("creates an expense idempotently", async () => {
    const app = buildApp();
    const payload = {
      amount: "199.50",
      category: "Food",
      description: "Groceries",
      date: "2026-04-10"
    };

    const firstResponse = await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "same-key")
      .send(payload);

    const secondResponse = await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "same-key")
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.expense.id).toBe(firstResponse.body.expense.id);

    const listResponse = await request(app).get("/api/expenses");
    expect(listResponse.body.expenses).toHaveLength(1);
  });

  it("filters and sorts expenses by date descending", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "one")
      .send({
        amount: "400.00",
        category: "Travel",
        description: "Train",
        date: "2026-04-01"
      });

    await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "two")
      .send({
        amount: "120.00",
        category: "Food",
        description: "Lunch",
        date: "2026-04-09"
      });

    await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "three")
      .send({
        amount: "80.00",
        category: "Food",
        description: "Coffee beans",
        date: "2026-04-11"
      });

    const response = await request(app).get("/api/expenses").query({ category: "Food", sort: "date_desc" });

    expect(response.status).toBe(200);
    expect(response.body.expenses).toHaveLength(2);
    expect(response.body.expenses[0].date).toBe("2026-04-11");
    expect(response.body.expenses[1].date).toBe("2026-04-09");
  });

  it("rejects a reused idempotency key for a different payload", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "conflict-key")
      .send({
        amount: "50.00",
        category: "Food",
        description: "Tea",
        date: "2026-04-11"
      });

    const response = await request(app)
      .post("/api/expenses")
      .set("Idempotency-Key", "conflict-key")
      .send({
        amount: "60.00",
        category: "Food",
        description: "Coffee",
        date: "2026-04-11"
      });

    expect(response.status).toBe(409);
  });
});