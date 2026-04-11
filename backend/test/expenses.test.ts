import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";

function buildApp() {
  return createApp(createMemoryExpenseStore(), async (authorizationHeader) => {
    const userId = authorizationHeader?.replace(/^Bearer\s+/i, "").trim();

    if (!userId) {
      throw new Error("Missing test user.");
    }

    return { id: userId };
  });
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
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "same-key")
      .send(payload);

    const secondResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "same-key")
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.expense.id).toBe(firstResponse.body.expense.id);

    const listResponse = await request(app)
      .get("/api/expenses")
      .set("Authorization", "Bearer user-one");
    expect(listResponse.body.expenses).toHaveLength(1);
  });

  it("filters and sorts expenses by date descending", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "one")
      .send({
        amount: "400.00",
        category: "Travel",
        description: "Train",
        date: "2026-04-01"
      });

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "two")
      .send({
        amount: "120.00",
        category: "Food",
        description: "Lunch",
        date: "2026-04-09"
      });

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "three")
      .send({
        amount: "80.00",
        category: "Food",
        description: "Coffee beans",
        date: "2026-04-11"
      });

    const response = await request(app)
      .get("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .query({ category: "Food", sort: "date_desc" });

    expect(response.status).toBe(200);
    expect(response.body.expenses).toHaveLength(2);
    expect(response.body.expenses[0].date).toBe("2026-04-11");
    expect(response.body.expenses[1].date).toBe("2026-04-09");
  });

  it("rejects a reused idempotency key for a different payload", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "conflict-key")
      .send({
        amount: "50.00",
        category: "Food",
        description: "Tea",
        date: "2026-04-11"
      });

    const response = await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "conflict-key")
      .send({
        amount: "60.00",
        category: "Food",
        description: "Coffee",
        date: "2026-04-11"
      });

    expect(response.status).toBe(409);
  });

  it("returns only the signed-in user's expenses", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "food-entry")
      .send({
        amount: "50.00",
        category: "Food",
        description: "Tea",
        date: "2026-04-11"
      });

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-two")
      .set("Idempotency-Key", "travel-entry")
      .send({
        amount: "70.00",
        category: "Travel",
        description: "Cab",
        date: "2026-04-11"
      });

    const response = await request(app)
      .get("/api/expenses")
      .set("Authorization", "Bearer user-two");

    expect(response.status).toBe(200);
    expect(response.body.expenses).toHaveLength(1);
    expect(response.body.expenses[0].description).toBe("Cab");
  });

  it("lets a user update and delete their own expense", async () => {
    const app = buildApp();

    const createResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "editable-entry")
      .send({
        amount: "50.00",
        category: "Food",
        description: "Tea",
        date: "2026-04-11"
      });

    const expenseId = createResponse.body.expense.id;

    const updateResponse = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "75.00",
        category: "Dining",
        description: "Lunch",
        date: "2026-04-12"
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.expense.category).toBe("Dining");
    expect(updateResponse.body.expense.amount).toBe("75.00");

    const deleteResponse = await request(app)
      .delete(`/api/expenses/${expenseId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(204);

    const listResponse = await request(app)
      .get("/api/expenses")
      .set("Authorization", "Bearer user-one");

    expect(listResponse.body.expenses).toHaveLength(0);
  });

  it("does not let a user edit or delete another user's expense", async () => {
    const app = buildApp();

    const createResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "protected-entry")
      .send({
        amount: "90.00",
        category: "Bills",
        description: "Internet",
        date: "2026-04-11"
      });

    const expenseId = createResponse.body.expense.id;

    const updateResponse = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set("Authorization", "Bearer user-two")
      .send({
        amount: "100.00",
        category: "Bills",
        description: "Changed",
        date: "2026-04-11"
      });

    expect(updateResponse.status).toBe(404);

    const deleteResponse = await request(app)
      .delete(`/api/expenses/${expenseId}`)
      .set("Authorization", "Bearer user-two");

    expect(deleteResponse.status).toBe(404);
  });

  it("deletes all stored data for the signed-in user account", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "account-food")
      .send({
        amount: "25.00",
        category: "Food",
        description: "Snack",
        date: "2026-04-11"
      });

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-two")
      .set("Idempotency-Key", "account-travel")
      .send({
        amount: "150.00",
        category: "Travel",
        description: "Flight",
        date: "2026-04-11"
      });

    const deleteResponse = await request(app)
      .delete("/api/account")
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(204);

    const deletedUserList = await request(app)
      .get("/api/expenses")
      .set("Authorization", "Bearer user-one");

    const otherUserList = await request(app)
      .get("/api/expenses")
      .set("Authorization", "Bearer user-two");

    expect(deletedUserList.body.expenses).toHaveLength(0);
    expect(otherUserList.body.expenses).toHaveLength(1);
    expect(otherUserList.body.expenses[0].description).toBe("Flight");
  });
});