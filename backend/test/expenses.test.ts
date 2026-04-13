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

  it("creates, updates, lists, and deletes user budgets", async () => {
    const app = buildApp();

    const createResponse = await request(app)
      .post("/api/budgets")
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "5000.00",
        scope: "monthly",
        month: "2026-04"
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.budget.scope).toBe("monthly");
    expect(createResponse.body.budget.amount).toBe("5000.00");

    const budgetId = createResponse.body.budget.id;

    const updateResponse = await request(app)
      .put(`/api/budgets/${budgetId}`)
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "1500.00",
        scope: "category",
        category: "Food",
        month: "2026-04"
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.budget.scope).toBe("category");
    expect(updateResponse.body.budget.category).toBe("Food");

    const listResponse = await request(app)
      .get("/api/budgets")
      .set("Authorization", "Bearer user-one");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.budgets).toHaveLength(1);
    expect(listResponse.body.budgets[0].category).toBe("Food");

    const deleteResponse = await request(app)
      .delete(`/api/budgets/${budgetId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await request(app)
      .get("/api/budgets")
      .set("Authorization", "Bearer user-one");

    expect(afterDeleteResponse.body.budgets).toHaveLength(0);
  });

  it("keeps budgets private to the signed-in user and clears them on account deletion", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/budgets")
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "3000.00",
        scope: "monthly",
        month: "2026-04"
      });

    await request(app)
      .post("/api/budgets")
      .set("Authorization", "Bearer user-two")
      .send({
        amount: "900.00",
        scope: "category",
        category: "Travel",
        month: "2026-04"
      });

    const userTwoBudgets = await request(app)
      .get("/api/budgets")
      .set("Authorization", "Bearer user-two");

    expect(userTwoBudgets.status).toBe(200);
    expect(userTwoBudgets.body.budgets).toHaveLength(1);
    expect(userTwoBudgets.body.budgets[0].category).toBe("Travel");

    const deleteResponse = await request(app)
      .delete("/api/account")
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(204);

    const deletedUserBudgets = await request(app)
      .get("/api/budgets")
      .set("Authorization", "Bearer user-one");

    const remainingUserBudgets = await request(app)
      .get("/api/budgets")
      .set("Authorization", "Bearer user-two");

    expect(deletedUserBudgets.body.budgets).toHaveLength(0);
    expect(remainingUserBudgets.body.budgets).toHaveLength(1);
    expect(remainingUserBudgets.body.budgets[0].category).toBe("Travel");
  });

  it("creates shared wallets, shared expenses, and settlements with live balances", async () => {
    const app = buildApp();

    const walletResponse = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Trip fund",
        description: "Weekend in Jaipur",
        defaultSplitRule: "equal",
        members: [{ displayName: "Alex" }, { displayName: "Sam" }]
      });

    expect(walletResponse.status).toBe(201);
    expect(walletResponse.body.wallet.members).toHaveLength(3);

    const walletId = walletResponse.body.wallet.wallet.id;
    const members = walletResponse.body.wallet.members as Array<{ id: string; display_name: string }>;
    const ownerMember = members.find((member) => member.display_name === "user-one");
    const alexMember = members.find((member) => member.display_name === "Alex");
    const samMember = members.find((member) => member.display_name === "Sam");

    expect(ownerMember).toBeTruthy();
    expect(alexMember).toBeTruthy();
    expect(samMember).toBeTruthy();

    const sharedExpenseResponse = await request(app)
      .post(`/api/wallets/${walletId}/expenses`)
      .set("Authorization", "Bearer user-one")
      .send({
        paidByMemberId: ownerMember?.id,
        amount: "900.00",
        category: "Travel",
        description: "Hotel booking",
        date: "2026-04-11",
        splitRule: "equal",
        splits: [{ memberId: ownerMember?.id }, { memberId: alexMember?.id }, { memberId: samMember?.id }]
      });

    expect(sharedExpenseResponse.status).toBe(201);
    expect(sharedExpenseResponse.body.wallet.expenses).toHaveLength(1);
    expect(sharedExpenseResponse.body.wallet.balances[0].member_name).toBe("user-one");
    expect(sharedExpenseResponse.body.wallet.balances[0].net_amount).toBe("600.00");

    const settlementResponse = await request(app)
      .post(`/api/wallets/${walletId}/settlements`)
      .set("Authorization", "Bearer user-one")
      .send({
        fromMemberId: alexMember?.id,
        toMemberId: ownerMember?.id,
        amount: "300.00",
        date: "2026-04-12",
        note: "Settled my share"
      });

    expect(settlementResponse.status).toBe(201);
    const ownerBalance = settlementResponse.body.wallet.balances.find((entry: { member_name: string }) => entry.member_name === "user-one");
    const alexBalance = settlementResponse.body.wallet.balances.find((entry: { member_name: string }) => entry.member_name === "Alex");

    expect(ownerBalance?.net_amount).toBe("300.00");
    expect(alexBalance?.net_amount).toBe("0.00");
    expect(settlementResponse.body.wallet.settlements).toHaveLength(1);
  });

  it("creates, updates, and deletes wallet budgets inside a shared wallet", async () => {
    const app = buildApp();

    const walletResponse = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Home fund",
        description: "Shared home costs",
        defaultSplitRule: "equal",
        members: [{ displayName: "Alex" }]
      });

    expect(walletResponse.status).toBe(201);

    const walletId = walletResponse.body.wallet.wallet.id;

    const createBudgetResponse = await request(app)
      .post(`/api/wallets/${walletId}/budgets`)
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "1200.00",
        scope: "category",
        category: "Groceries",
        month: "2026-04"
      });

    expect(createBudgetResponse.status).toBe(201);
    expect(createBudgetResponse.body.wallet.budgets).toHaveLength(1);
    expect(createBudgetResponse.body.wallet.budgets[0].category).toBe("Groceries");

    const walletBudgetId = createBudgetResponse.body.wallet.budgets[0].id;

    const updateBudgetResponse = await request(app)
      .put(`/api/wallets/${walletId}/budgets/${walletBudgetId}`)
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "1800.00",
        scope: "monthly",
        month: "2026-04"
      });

    expect(updateBudgetResponse.status).toBe(200);
    expect(updateBudgetResponse.body.wallet.budgets[0].scope).toBe("monthly");
    expect(updateBudgetResponse.body.wallet.budgets[0].amount).toBe("1800.00");

    const walletDetailResponse = await request(app)
      .get(`/api/wallets/${walletId}`)
      .set("Authorization", "Bearer user-one");

    expect(walletDetailResponse.status).toBe(200);
    expect(walletDetailResponse.body.wallet.budgets).toHaveLength(1);

    const deleteBudgetResponse = await request(app)
      .delete(`/api/wallets/${walletId}/budgets/${walletBudgetId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteBudgetResponse.status).toBe(200);
    expect(deleteBudgetResponse.body.wallet.budgets).toHaveLength(0);
  });

  it("creates an in-app wallet invite and waits for explicit acceptance", async () => {
    const app = buildApp();

    const walletResponse = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Household",
        description: "Shared bills",
        defaultSplitRule: "equal",
        members: [{ displayName: "User Two", email: "user-two@example.com" }]
      });

    expect(walletResponse.status).toBe(201);

    const listResponse = await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer user-two");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.wallets).toHaveLength(0);

    const notificationsResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-two");

    expect(notificationsResponse.status).toBe(200);
    const inviteNotification = notificationsResponse.body.notifications.find((notification: { type: string }) => notification.type === "wallet-invite");

    expect(inviteNotification).toBeTruthy();
    expect(inviteNotification.title).toContain("Household");

    const walletMemberId = inviteNotification.metadata.walletMemberId;
    const acceptResponse = await request(app)
      .post(`/api/wallet-invites/${walletMemberId}/respond`)
      .set("Authorization", "Bearer user-two")
      .send({ action: "accept" });

    expect(acceptResponse.status).toBe(204);

    const acceptedWalletsResponse = await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer user-two");

    expect(acceptedWalletsResponse.status).toBe(200);
    expect(acceptedWalletsResponse.body.wallets).toHaveLength(1);

    const walletId = acceptedWalletsResponse.body.wallets[0].id;
    const detailResponse = await request(app)
      .get(`/api/wallets/${walletId}`)
      .set("Authorization", "Bearer user-two");

    expect(detailResponse.status).toBe(200);
    const linkedMember = detailResponse.body.wallet.members.find((member: { email: string | null }) => member.email === "user-two@example.com");

    expect(linkedMember?.user_id).toBe("user-two");
    expect(linkedMember?.invite_status).toBe("linked");
  });

  it("deletes a notification from the user's stored notifications", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Household",
        description: "Shared bills",
        defaultSplitRule: "equal",
        members: [{ displayName: "User Two", email: "user-two@example.com" }]
      });

    const notificationsResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-two");

    expect(notificationsResponse.status).toBe(200);
    expect(notificationsResponse.body.notifications).toHaveLength(1);

    const notificationId = notificationsResponse.body.notifications[0].id;

    const deleteResponse = await request(app)
      .delete(`/api/notifications/${notificationId}`)
      .set("Authorization", "Bearer user-two");

    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-two");

    expect(afterDeleteResponse.body.notifications).toHaveLength(1);
    expect(afterDeleteResponse.body.notifications[0].id).not.toBe(notificationId);
  });

  it("lets a user decline a wallet invite without joining the wallet", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Roommates",
        description: "Utilities",
        defaultSplitRule: "equal",
        members: [{ displayName: "User Two", email: "user-two@example.com" }]
      });

    const notificationsResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-two");

    const inviteNotification = notificationsResponse.body.notifications.find((notification: { type: string }) => notification.type === "wallet-invite");
    expect(inviteNotification).toBeTruthy();

    const declineResponse = await request(app)
      .post(`/api/wallet-invites/${inviteNotification.metadata.walletMemberId}/respond`)
      .set("Authorization", "Bearer user-two")
      .send({ action: "decline" });

    expect(declineResponse.status).toBe(204);

    const walletsResponse = await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer user-two");

    expect(walletsResponse.status).toBe(200);
    expect(walletsResponse.body.wallets).toHaveLength(0);
  });

  it("lets a member exit a wallet and removes their access", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Trip fund",
        description: "Weekend in Jaipur",
        defaultSplitRule: "equal",
        members: [{ displayName: "User Two", email: "user-two@example.com" }]
      });

    const notificationsResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-two");

    const inviteNotification = notificationsResponse.body.notifications[0];

    await request(app)
      .post(`/api/wallet-invites/${inviteNotification.metadata.walletMemberId}/respond`)
      .set("Authorization", "Bearer user-two")
      .send({ action: "accept" });

    const walletsResponse = await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer user-two");

    const walletId = walletsResponse.body.wallets[0].id;

    const leaveResponse = await request(app)
      .post(`/api/wallets/${walletId}/leave`)
      .set("Authorization", "Bearer user-two");

    expect(leaveResponse.status).toBe(204);

    const afterLeaveWallets = await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer user-two");

    expect(afterLeaveWallets.status).toBe(200);
    expect(afterLeaveWallets.body.wallets).toHaveLength(0);
  });

  it("lets the wallet owner delete the whole group", async () => {
    const app = buildApp();

    const walletResponse = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Home fund",
        description: "Shared home costs",
        defaultSplitRule: "equal",
        members: [{ displayName: "Alex" }]
      });

    const walletId = walletResponse.body.wallet.wallet.id;

    const deleteResponse = await request(app)
      .delete(`/api/wallets/${walletId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(204);

    const walletsResponse = await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer user-one");

    expect(walletsResponse.status).toBe(200);
    expect(walletsResponse.body.wallets).toHaveLength(0);
  });

  it("adds members and lets shared expenses be updated and deleted", async () => {
    const app = buildApp();

    const walletResponse = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Trip fund",
        description: "Weekend in Jaipur",
        defaultSplitRule: "equal",
        members: [{ displayName: "Alex" }]
      });

    const walletId = walletResponse.body.wallet.wallet.id;

    const addMemberResponse = await request(app)
      .post(`/api/wallets/${walletId}/members`)
      .set("Authorization", "Bearer user-one")
      .send({
        displayName: "Sam",
        email: "sam@example.com"
      });

    expect(addMemberResponse.status).toBe(201);
    expect(addMemberResponse.body.wallet.members).toHaveLength(3);

    const members = addMemberResponse.body.wallet.members as Array<{ id: string; display_name: string }>;
    const ownerMember = members.find((member) => member.display_name === "user-one");
    const alexMember = members.find((member) => member.display_name === "Alex");
    const samMember = members.find((member) => member.display_name === "Sam");

    const expenseResponse = await request(app)
      .post(`/api/wallets/${walletId}/expenses`)
      .set("Authorization", "Bearer user-one")
      .send({
        paidByMemberId: ownerMember?.id,
        amount: "900.00",
        category: "Travel",
        description: "Hotel booking",
        date: "2026-04-11",
        splitRule: "equal",
        splits: [{ memberId: ownerMember?.id }, { memberId: alexMember?.id }, { memberId: samMember?.id }]
      });

    expect(expenseResponse.status).toBe(201);
    const walletExpenseId = expenseResponse.body.wallet.expenses[0].id;

    const updateResponse = await request(app)
      .put(`/api/wallets/${walletId}/expenses/${walletExpenseId}`)
      .set("Authorization", "Bearer user-one")
      .send({
        paidByMemberId: alexMember?.id,
        amount: "600.00",
        category: "Lodging",
        description: "Updated hotel booking",
        date: "2026-04-12",
        splitRule: "fixed",
        splits: [
          { memberId: ownerMember?.id, value: "200.00" },
          { memberId: alexMember?.id, value: "200.00" },
          { memberId: samMember?.id, value: "200.00" }
        ]
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.wallet.expenses[0].category).toBe("Lodging");
    expect(updateResponse.body.wallet.expenses[0].paid_by_member_name).toBe("Alex");

    const deleteResponse = await request(app)
      .delete(`/api/wallets/${walletId}/expenses/${walletExpenseId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.wallet.expenses).toHaveLength(0);
  });

  it("lets settlements be updated and deleted", async () => {
    const app = buildApp();

    const walletResponse = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer user-one")
      .send({
        name: "Household",
        description: "Rent split",
        defaultSplitRule: "equal",
        members: [{ displayName: "Alex" }]
      });

    const walletId = walletResponse.body.wallet.wallet.id;
    const members = walletResponse.body.wallet.members as Array<{ id: string; display_name: string }>;
    const ownerMember = members.find((member) => member.display_name === "user-one");
    const alexMember = members.find((member) => member.display_name === "Alex");

    const settlementResponse = await request(app)
      .post(`/api/wallets/${walletId}/settlements`)
      .set("Authorization", "Bearer user-one")
      .send({
        fromMemberId: alexMember?.id,
        toMemberId: ownerMember?.id,
        amount: "300.00",
        date: "2026-04-12",
        note: "Settled my share"
      });

    expect(settlementResponse.status).toBe(201);
    const settlementId = settlementResponse.body.wallet.settlements[0].id;

    const updateResponse = await request(app)
      .put(`/api/wallets/${walletId}/settlements/${settlementId}`)
      .set("Authorization", "Bearer user-one")
      .send({
        fromMemberId: alexMember?.id,
        toMemberId: ownerMember?.id,
        amount: "200.00",
        date: "2026-04-13",
        note: "Adjusted settlement"
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.wallet.settlements[0].amount).toBe("200.00");
    expect(updateResponse.body.wallet.settlements[0].note).toBe("Adjusted settlement");

    const deleteResponse = await request(app)
      .delete(`/api/wallets/${walletId}/settlements/${settlementId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.wallet.settlements).toHaveLength(0);
  });

  it("creates budget and daily-log notifications through reminder checks", async () => {
    const app = buildApp();

    await request(app)
      .put("/api/reminder-preferences")
      .set("Authorization", "Bearer user-one")
      .send({
        dailyLoggingEnabled: true,
        dailyLoggingHour: 0,
        budgetAlertsEnabled: true,
        budgetAlertThreshold: 80
      });

    await request(app)
      .post("/api/budgets")
      .set("Authorization", "Bearer user-one")
      .send({
        amount: "100.00",
        scope: "monthly",
        month: new Date().toISOString().slice(0, 7)
      });

    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-one")
      .set("Idempotency-Key", "notifications-seed")
      .send({
        amount: "90.00",
        category: "Food",
        description: "Dinner",
        date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
      });

    const runChecksResponse = await request(app)
      .post("/api/notifications/run-checks")
      .set("Authorization", "Bearer user-one");

    expect(runChecksResponse.status).toBe(200);
    expect(runChecksResponse.body.created_notifications.length).toBeGreaterThanOrEqual(2);

    const notificationsResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-one");

    expect(notificationsResponse.status).toBe(200);
    expect(notificationsResponse.body.notifications.some((notification: { type: string }) => notification.type === "budget-threshold")).toBe(true);
    expect(notificationsResponse.body.notifications.some((notification: { type: string }) => notification.type === "daily-log")).toBe(true);

    const firstNotificationId = notificationsResponse.body.notifications[0].id;
    const markReadResponse = await request(app)
      .patch(`/api/notifications/${firstNotificationId}/read`)
      .set("Authorization", "Bearer user-one");

    expect(markReadResponse.status).toBe(200);
    expect(markReadResponse.body.notification.status).toBe("read");
  });

  it("creates, updates, lists, and deletes recurring bill reminders with notifications", async () => {
    const app = buildApp();
    const today = new Date().toISOString().slice(0, 10);

    const createResponse = await request(app)
      .post("/api/bill-reminders")
      .set("Authorization", "Bearer user-one")
      .send({
        title: "Electricity bill",
        amount: "125.50",
        category: "Utilities",
        dueDate: today,
        recurrence: "monthly",
        intervalCount: 1,
        reminderDaysBefore: 0,
        isActive: true
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.billReminder.recurrence).toBe("monthly");

    const billReminderId = createResponse.body.billReminder.id;

    const updateResponse = await request(app)
      .put(`/api/bill-reminders/${billReminderId}`)
      .set("Authorization", "Bearer user-one")
      .send({
        title: "Electricity bill",
        amount: "130.00",
        category: "Utilities",
        dueDate: today,
        recurrence: "monthly",
        intervalCount: 1,
        reminderDaysBefore: 0,
        isActive: true
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.billReminder.amount).toBe("130.00");

    const listResponse = await request(app)
      .get("/api/bill-reminders")
      .set("Authorization", "Bearer user-one");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.billReminders).toHaveLength(1);

    const runChecksResponse = await request(app)
      .post("/api/notifications/run-checks")
      .set("Authorization", "Bearer user-one");

    expect(runChecksResponse.status).toBe(200);
    expect(runChecksResponse.body.created_notifications.some((notification: { type: string }) => notification.type === "bill-due")).toBe(true);

    const notificationsResponse = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer user-one");

    expect(notificationsResponse.status).toBe(200);
    expect(notificationsResponse.body.notifications.some((notification: { type: string }) => notification.type === "bill-due")).toBe(true);

    const deleteResponse = await request(app)
      .delete(`/api/bill-reminders/${billReminderId}`)
      .set("Authorization", "Bearer user-one");

    expect(deleteResponse.status).toBe(204);
  });
});