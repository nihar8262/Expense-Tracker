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
      return { id: userId, email: `${userId}@example.com`, name: userId, picture: null, emailVerified: true };
    },
    async () => {}
  );
}

describe("Bank Accounts & Feedback API", () => {
  it("creates, lists, updates, and deletes bank accounts", async () => {
    const app = buildApp();
    const token = "Bearer user-bank-1";

    // 1. Initial list should be empty
    const listRes1 = await request(app)
      .get("/api/profile/banks")
      .set("Authorization", token);
    expect(listRes1.status).toBe(200);
    expect(listRes1.body.bankAccounts).toHaveLength(0);

    // 2. Create bank account with optional last 4 digits
    const createRes1 = await request(app)
      .post("/api/profile/banks")
      .set("Authorization", token)
      .send({
        bankId: "hdfc",
        bankName: "HDFC Bank",
        accountType: "credit",
        accountLabel: "Millennia Card",
        lastFourDigits: "1234",
        isDefault: true
      });
    expect(createRes1.status).toBe(201);
    expect(createRes1.body.bankAccount).toMatchObject({
      bank_id: "hdfc",
      bank_name: "HDFC Bank",
      account_type: "credit",
      account_label: "Millennia Card",
      last_four_digits: "1234",
      is_default: true
    });
    const account1Id = createRes1.body.bankAccount.id;

    // 3. Create second bank account without last four digits (optional)
    const createRes2 = await request(app)
      .post("/api/profile/banks")
      .set("Authorization", token)
      .send({
        bankId: "sbi",
        bankName: "State Bank of India",
        accountType: "debit",
        isDefault: false
      });
    expect(createRes2.status).toBe(201);
    expect(createRes2.body.bankAccount.last_four_digits).toBeNull();
    expect(createRes2.body.bankAccount.is_default).toBe(false);

    // 4. List bank accounts - should return 2 accounts
    const listRes2 = await request(app)
      .get("/api/profile/banks")
      .set("Authorization", token);
    expect(listRes2.status).toBe(200);
    expect(listRes2.body.bankAccounts).toHaveLength(2);

    // 5. Update account label and default status
    const updateRes = await request(app)
      .patch(`/api/profile/banks/${account1Id}`)
      .set("Authorization", token)
      .send({
        accountLabel: "Primary HDFC CC"
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.bankAccount.account_label).toBe("Primary HDFC CC");

    // 6. Delete account
    const deleteRes = await request(app)
      .delete(`/api/profile/banks/${account1Id}`)
      .set("Authorization", token);
    expect(deleteRes.status).toBe(200);

    const listRes3 = await request(app)
      .get("/api/profile/banks")
      .set("Authorization", token);
    expect(listRes3.status).toBe(200);
    expect(listRes3.body.bankAccounts).toHaveLength(1);
    expect(listRes3.body.bankAccounts[0].bank_id).toBe("sbi");
  });

  it("creates expense linked to a bank account", async () => {
    const app = buildApp();
    const token = "Bearer user-bank-exp";

    const expenseRes = await request(app)
      .post("/api/expenses")
      .set("Authorization", token)
      .set("Idempotency-Key", "test-bank-expense-1")
      .send({
        amount: "550.00",
        category: "Shopping",
        description: "New earphones",
        date: "2026-04-10",
        bankAccountId: "bank-acc-uuid-1",
        bankName: "HDFC Bank"
      });
    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.expense.bank_account_id).toBe("bank-acc-uuid-1");
    expect(expenseRes.body.expense.bank_name).toBe("HDFC Bank");
  });

  it("submits user feedback gracefully", async () => {
    const app = buildApp();
    const token = "Bearer user-feedback";

    const feedbackRes = await request(app)
      .post("/api/feedback")
      .set("Authorization", token)
      .send({
        category: "feature",
        message: "Please add dark mode toggle for reports chart!",
        rating: 5,
        userName: "John Doe"
      });
    expect(feedbackRes.status).toBe(201);
    expect(feedbackRes.body.feedback).toMatchObject({
      category: "feature",
      message: "Please add dark mode toggle for reports chart!",
      rating: 5,
      user_name: "John Doe"
    });

    const feedbackId = feedbackRes.body.feedback.id;

    // List feedbacks
    const listRes = await request(app)
      .get("/api/feedback")
      .set("Authorization", token);
    expect(listRes.status).toBe(200);
    expect(listRes.body.feedbacks).toHaveLength(1);

    // Edit feedback within 24h
    const updateRes = await request(app)
      .patch(`/api/feedback/${feedbackId}`)
      .set("Authorization", token)
      .send({
        message: "Updated: Please add dark mode toggle for reports chart soon!"
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.feedback.message).toBe("Updated: Please add dark mode toggle for reports chart soon!");

    // Submit 4 more feedbacks to reach 5
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/feedback")
        .set("Authorization", token)
        .send({
          category: "feedback",
          message: `Feedback ${i + 2}`,
          rating: 4
        });
      expect(res.status).toBe(201);
    }

    // 6th feedback should be rate limited with 429
    const blockedRes = await request(app)
      .post("/api/feedback")
      .set("Authorization", token)
      .send({
        category: "bug",
        message: "Blocked 6th feedback"
      });
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toContain("5 feedbacks per day");

    // Another user cannot delete this user's feedback
    const otherToken = "Bearer user-other";
    const unauthorizedDelete = await request(app)
      .delete(`/api/feedback/${feedbackId}`)
      .set("Authorization", otherToken);
    expect(unauthorizedDelete.status).toBe(404);

    // Owner can delete their feedback
    const deleteRes = await request(app)
      .delete(`/api/feedback/${feedbackId}`)
      .set("Authorization", token);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toContain("deleted");

    // Feedback is deleted from list
    const finalListRes = await request(app)
      .get("/api/feedback")
      .set("Authorization", token);
    expect(finalListRes.status).toBe(200);
    expect(finalListRes.body.feedbacks.find((f: { id: string }) => f.id === feedbackId)).toBeUndefined();
  });
});
