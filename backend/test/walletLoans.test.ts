import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryExpenseStore } from "../src/store/memory.js";

function buildApp(store = createMemoryExpenseStore()) {
  return {
    app: createApp(
      store,
      async (authorizationHeader) => {
        const userId = authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
        if (!userId) {
          throw new Error("Missing test user.");
        }
        return { id: userId, email: `${userId}@example.com`, name: userId === "alice-user" ? "Alice Borrower" : userId, picture: null, emailVerified: userId !== "unverified-user" };
      },
      async () => {}
    ),
    store
  };
}

describe("Wallet Loans & Lending API", () => {
  it("allows wallet owner to create a loan with interest and schedule, while preventing non-owner members from editing", async () => {
    const { app } = buildApp();

    // 1. Owner creates a wallet
    const createWalletRes = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer owner-user")
      .send({
        name: "Trip & Lending Fund",
        description: "Shared group wallet with lending",
        defaultSplitRule: "equal",
        currency: "INR",
        members: [
          { displayName: "Alice Borrower", email: "alice-user@example.com" },
          { displayName: "Bob Observer", email: "bob@example.com" }
        ]
      });

    expect(createWalletRes.status).toBe(201);
    const walletId = createWalletRes.body.wallet.wallet.id;
    const members = createWalletRes.body.wallet.members;
    const aliceMember = members.find((m: any) => m.display_name === "Alice Borrower");
    expect(aliceMember).toBeDefined();

    // Link and accept Alice's invite
    await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer alice-user");

    // Verify unverified user cannot accept invite
    const unverifiedRes = await request(app)
      .post(`/api/wallet-invites/${aliceMember.id}/respond`)
      .set("Authorization", "Bearer unverified-user")
      .send({ action: "accept" });
    expect(unverifiedRes.status).toBe(403);
    expect(unverifiedRes.body.error).toContain("verified email");

    await request(app)
      .post(`/api/wallet-invites/${aliceMember.id}/respond`)
      .set("Authorization", "Bearer alice-user")
      .send({ action: "accept" });

    // 2. Owner creates a loan to Alice
    const createLoanRes = await request(app)
      .post(`/api/wallets/${walletId}/loans`)
      .set("Authorization", "Bearer owner-user")
      .send({
        borrowerMemberId: aliceMember.id,
        amount: "5000.00",
        interestRate: "5.0",
        interestType: "percentage",
        interestRatePeriod: "monthly",
        lendingDate: "2026-09-01",
        interestStartDate: "2026-10-01",
        dueDate: "2026-12-31",
        notes: "Emergency medical advance"
      });

    expect(createLoanRes.status).toBe(201);
    expect(createLoanRes.body.wallet.loans).toHaveLength(1);
    const loan = createLoanRes.body.wallet.loans[0];
    expect(loan.amount).toBe("5000.00");
    expect(loan.interest_rate).toBe(5);
    expect(loan.interest_type).toBe("percentage");
    expect(loan.interest_rate_period).toBe("monthly");
    expect(loan.lending_date).toBe("2026-09-01");
    expect(loan.interest_start_date).toBe("2026-10-01");
    expect(loan.due_date).toBe("2026-12-31");
    expect(loan.borrower_member_name).toBe("Alice Borrower");
    expect(loan.repayments).toHaveLength(0);

    // 3. Alice (non-owner member) tries to create a loan -> Should fail (Owner only)
    const unauthorizedCreateLoan = await request(app)
      .post(`/api/wallets/${walletId}/loans`)
      .set("Authorization", "Bearer alice-user")
      .send({
        borrowerMemberId: aliceMember.id,
        amount: "1000.00",
        lendingDate: "2026-09-05"
      });

    expect(unauthorizedCreateLoan.status).toBe(400);
    expect(unauthorizedCreateLoan.body.error).toContain("Only the wallet owner");

    // 4. Alice (non-owner member) tries to update loan terms -> Should fail (Owner only)
    const unauthorizedUpdateLoan = await request(app)
      .put(`/api/wallets/${walletId}/loans/${loan.id}`)
      .set("Authorization", "Bearer alice-user")
      .send({
        interestRate: "0"
      });

    expect(unauthorizedUpdateLoan.status).toBe(400);
    expect(unauthorizedUpdateLoan.body.error).toContain("Only the wallet owner");

    // 5. Alice can view the wallet and sees the loan
    const aliceGetWallet = await request(app)
      .get(`/api/wallets/${walletId}`)
      .set("Authorization", "Bearer alice-user");

    expect(aliceGetWallet.status).toBe(200);
    expect(aliceGetWallet.body.wallet.loans).toHaveLength(1);
    expect(aliceGetWallet.body.wallet.loans[0].amount).toBe("5000.00");

    // 6. Owner updates loan terms (e.g. notes and due date)
    const ownerUpdateLoan = await request(app)
      .put(`/api/wallets/${walletId}/loans/${loan.id}`)
      .set("Authorization", "Bearer owner-user")
      .send({
        notes: "Emergency medical advance - extended terms",
        dueDate: "2027-01-31"
      });

    expect(ownerUpdateLoan.status).toBe(200);
    expect(ownerUpdateLoan.body.wallet.loans[0].notes).toBe("Emergency medical advance - extended terms");
    expect(ownerUpdateLoan.body.wallet.loans[0].due_date).toBe("2027-01-31");

    // 7. Owner records a repayment
    const recordRepaymentRes = await request(app)
      .post(`/api/wallets/${walletId}/loans/${loan.id}/repayments`)
      .set("Authorization", "Bearer owner-user")
      .send({
        amount: "2000.00",
        repaymentDate: "2026-09-15",
        notes: "First installment repayment"
      });

    expect(recordRepaymentRes.status).toBe(201);
    const updatedLoan = recordRepaymentRes.body.wallet.loans[0];
    expect(updatedLoan.repayments).toHaveLength(1);
    expect(updatedLoan.repayments[0].amount).toBe("2000.00");
    expect(updatedLoan.repayments[0].notes).toBe("First installment repayment");

    const repaymentId = updatedLoan.repayments[0].id;

    // 8. Non-owner tries to delete repayment -> Should fail
    const unauthorizedDeleteRepayment = await request(app)
      .delete(`/api/wallets/${walletId}/loans/${loan.id}/repayments/${repaymentId}`)
      .set("Authorization", "Bearer alice-user");

    expect(unauthorizedDeleteRepayment.status).toBe(400);
    expect(unauthorizedDeleteRepayment.body.error).toContain("Only the wallet owner");

    // 9. Owner deletes repayment
    const ownerDeleteRepayment = await request(app)
      .delete(`/api/wallets/${walletId}/loans/${loan.id}/repayments/${repaymentId}`)
      .set("Authorization", "Bearer owner-user");

    expect(ownerDeleteRepayment.status).toBe(200);
    expect(ownerDeleteRepayment.body.wallet.loans[0].repayments).toHaveLength(0);

    // 10. Non-owner tries to delete loan -> Should fail
    const unauthorizedDeleteLoan = await request(app)
      .delete(`/api/wallets/${walletId}/loans/${loan.id}`)
      .set("Authorization", "Bearer alice-user");

    expect(unauthorizedDeleteLoan.status).toBe(400);

    // 11. Owner deletes loan
    const ownerDeleteLoan = await request(app)
      .delete(`/api/wallets/${walletId}/loans/${loan.id}`)
      .set("Authorization", "Bearer owner-user");

    expect(ownerDeleteLoan.status).toBe(200);
    expect(ownerDeleteLoan.body.wallet.loans).toHaveLength(0);
  });

  it("supports standalone peer loans without needing a shared wallet", async () => {
    const { app } = buildApp();

    // 1. Create a standalone loan with borrower name, amount, and custom interest
    const createRes = await request(app)
      .post("/api/loans")
      .set("Authorization", "Bearer lender-user")
      .send({
        borrowerName: "David Friend",
        borrowerEmail: "david@example.com",
        amount: "15000.00",
        interestRate: "2.5",
        interestType: "percentage",
        interestRatePeriod: "monthly",
        lendingDate: "2026-09-01",
        interestStartDate: "2026-10-01",
        dueDate: "2027-03-01",
        notes: "Equipment purchase loan"
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.loan).toBeDefined();
    const loan = createRes.body.loan;
    expect(loan.borrower_name).toBe("David Friend");
    expect(loan.borrower_email).toBe("david@example.com");
    expect(loan.amount).toBe("15000.00");
    expect(loan.interest_rate).toBe(2.5);
    expect(loan.interest_type).toBe("percentage");
    expect(loan.interest_rate_period).toBe("monthly");
    expect(loan.wallet_id).toBeNull();
    expect(loan.owner_user_id).toBe("lender-user");

    // 2. List standalone loans for lender
    const listRes = await request(app)
      .get("/api/loans")
      .set("Authorization", "Bearer lender-user");

    expect(listRes.status).toBe(200);
    expect(listRes.body.loans).toHaveLength(1);
    expect(listRes.body.loans[0].id).toBe(loan.id);

    // Another user cannot see lender's loans
    const otherListRes = await request(app)
      .get("/api/loans")
      .set("Authorization", "Bearer other-user");

    expect(otherListRes.status).toBe(200);
    expect(otherListRes.body.loans).toHaveLength(0);

    // 3. Update standalone loan
    const updateRes = await request(app)
      .put(`/api/loans/${loan.id}`)
      .set("Authorization", "Bearer lender-user")
      .send({
        notes: "Equipment purchase loan - updated terms",
        dueDate: "2027-06-01"
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.loan.notes).toBe("Equipment purchase loan - updated terms");
    expect(updateRes.body.loan.due_date).toBe("2027-06-01");

    // Other user cannot update loan
    const unauthorizedUpdate = await request(app)
      .put(`/api/loans/${loan.id}`)
      .set("Authorization", "Bearer other-user")
      .send({ notes: "Hacked" });

    expect(unauthorizedUpdate.status).toBe(404);

    // 4. Record standalone repayment
    const repaymentRes = await request(app)
      .post(`/api/loans/${loan.id}/repayments`)
      .set("Authorization", "Bearer lender-user")
      .send({
        amount: "5000.00",
        repaymentDate: "2026-09-10",
        notes: "First installment"
      });

    expect(repaymentRes.status).toBe(201);
    expect(repaymentRes.body.loan).toBeDefined();
    expect(repaymentRes.body.loan.repayments).toHaveLength(1);
    expect(repaymentRes.body.loan.repayments[0].amount).toBe("5000.00");
    const repaymentId = repaymentRes.body.loan.repayments[0].id;

    // Verify loan has repayment attached in list
    const listAfterRepayment = await request(app)
      .get("/api/loans")
      .set("Authorization", "Bearer lender-user");
    expect(listAfterRepayment.body.loans[0].repayments).toHaveLength(1);

    // 5. Delete repayment
    const deleteRepaymentRes = await request(app)
      .delete(`/api/loans/${loan.id}/repayments/${repaymentId}`)
      .set("Authorization", "Bearer lender-user");

    expect(deleteRepaymentRes.status).toBe(200);

    // 6. Delete standalone loan
    const deleteLoanRes = await request(app)
      .delete(`/api/loans/${loan.id}`)
      .set("Authorization", "Bearer lender-user");

    expect(deleteLoanRes.status).toBe(200);

    const listAfterDelete = await request(app)
      .get("/api/loans")
      .set("Authorization", "Bearer lender-user");
    expect(listAfterDelete.body.loans).toHaveLength(0);
  });

  it("successfully deletes a shared wallet with loans and repayments", async () => {
    const { app } = buildApp();

    // 1. Create wallet
    const createWalletRes = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer owner-user")
      .send({
        name: "Lending Group To Delete",
        defaultSplitRule: "equal",
        currency: "INR",
        members: [{ displayName: "Borrower Bob", email: "bob@example.com" }]
      });

    expect(createWalletRes.status).toBe(201);
    const walletId = createWalletRes.body.wallet.wallet.id;
    const bobMember = createWalletRes.body.wallet.members.find((m: any) => m.display_name === "Borrower Bob");

    // 2. Add loan & repayment to the wallet
    const createLoanRes = await request(app)
      .post(`/api/wallets/${walletId}/loans`)
      .set("Authorization", "Bearer owner-user")
      .send({
        borrowerMemberId: bobMember.id,
        amount: "3000.00",
        interestRate: "10.0",
        lendingDate: "2026-09-01"
      });

    expect(createLoanRes.status).toBe(201);
    const loanId = createLoanRes.body.wallet.loans[0].id;

    await request(app)
      .post(`/api/wallets/${walletId}/loans/${loanId}/repayments`)
      .set("Authorization", "Bearer owner-user")
      .send({
        amount: "1000.00",
        repaymentDate: "2026-09-05"
      });

    // 3. Delete the entire wallet
    const deleteWalletRes = await request(app)
      .delete(`/api/wallets/${walletId}`)
      .set("Authorization", "Bearer owner-user");

    expect(deleteWalletRes.status).toBe(204);

    // 4. Verify wallet is gone
    const getWalletRes = await request(app)
      .get(`/api/wallets/${walletId}`)
      .set("Authorization", "Bearer owner-user");

    expect(getWalletRes.status).toBe(404);
  });

  it("notifies member when a loan is issued and sends overdue alert notification when due date has passed", async () => {
    const { app } = buildApp();

    // 1. Create wallet with member Charlie
    const createWalletRes = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer owner-user")
      .send({
        name: "Lending Circle",
        defaultSplitRule: "equal",
        currency: "INR",
        members: [{ displayName: "Charlie", email: "charlie-user@example.com" }]
      });

    expect(createWalletRes.status).toBe(201);
    const walletId = createWalletRes.body.wallet.wallet.id;
    const charlieMember = createWalletRes.body.wallet.members.find((m: any) => m.display_name === "Charlie");

    // Link Charlie user
    await request(app)
      .get("/api/wallets")
      .set("Authorization", "Bearer charlie-user");

    await request(app)
      .post(`/api/wallet-invites/${charlieMember.id}/respond`)
      .set("Authorization", "Bearer charlie-user")
      .send({ action: "accept" });

    // 2. Owner creates a loan to Charlie with past due date (overdue)
    const createLoanRes = await request(app)
      .post(`/api/wallets/${walletId}/loans`)
      .set("Authorization", "Bearer owner-user")
      .send({
        borrowerMemberId: charlieMember.id,
        amount: "2500.00",
        interestRate: "0",
        lendingDate: "2026-08-01",
        dueDate: "2026-08-15",
        notes: "Monthly borrowing"
      });

    expect(createLoanRes.status).toBe(201);

    // 3. Charlie checks notifications: should have loan-issued notification
    const charlieNotifications = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer charlie-user");

    expect(charlieNotifications.status).toBe(200);
    const loanIssued = charlieNotifications.body.notifications.find((n: any) => n.type === "loan-issued");
    expect(loanIssued).toBeDefined();
    expect(loanIssued.title).toContain("2500.00");

    // 4. Run reminder checks (simulating cron / alerts check)
    const runChecksRes = await request(app)
      .post("/api/notifications/run-checks")
      .set("Authorization", "Bearer charlie-user");

    expect(runChecksRes.status).toBe(200);

    // 5. Charlie checks notifications again: should have loan-overdue alert
    const charlieNotificationsAfter = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer charlie-user");

    const loanOverdue = charlieNotificationsAfter.body.notifications.find((n: any) => n.type === "loan-overdue");
    expect(loanOverdue).toBeDefined();
    expect(loanOverdue.title).toContain("Overdue Loan Payment Alert");
    expect(loanOverdue.message).toContain("2500.00");
    expect(loanOverdue.message).toContain("2026-08-15");
  });

  it("supports borrowed loanType, repayment updating, and email-based loan notifications", async () => {
    const { app } = buildApp();

    // 1. Create a wallet and a member
    const createWalletRes = await request(app)
      .post("/api/wallets")
      .set("Authorization", "Bearer owner-user")
      .send({
        name: "Lending & Borrowing Test",
        members: [{ displayName: "Dave Lender", email: "dave-user@example.com" }]
      });
    expect(createWalletRes.status).toBe(201);
    const walletId = createWalletRes.body.wallet.wallet.id;
    const daveMember = createWalletRes.body.wallet.members.find((m: any) => m.display_name === "Dave Lender");

    // 2. Create a borrowed loan (money owner borrowed from Dave)
    const createBorrowedRes = await request(app)
      .post(`/api/wallets/${walletId}/loans`)
      .set("Authorization", "Bearer owner-user")
      .send({
        borrowerMemberId: daveMember.id,
        amount: "3000.00",
        loanType: "borrowed",
        lendingDate: "2026-09-01",
        notes: "Borrowed for equipment purchase"
      });

    expect(createBorrowedRes.status).toBe(201);
    const borrowedLoan = createBorrowedRes.body.wallet.loans[0];
    expect(borrowedLoan.loan_type).toBe("borrowed");
    expect(borrowedLoan.amount).toBe("3000.00");

    // 3. Record a repayment
    const addRepaymentRes = await request(app)
      .post(`/api/wallets/${walletId}/loans/${borrowedLoan.id}/repayments`)
      .set("Authorization", "Bearer owner-user")
      .send({
        amount: "1500.00",
        repaymentDate: "2026-09-10",
        notes: "First installment"
      });

    expect(addRepaymentRes.status).toBe(201);
    const repayments = addRepaymentRes.body.wallet.loans[0].repayments;
    expect(repayments).toHaveLength(1);
    expect(repayments[0].amount).toBe("1500.00");
    const repaymentId = repayments[0].id;

    // 4. Update the repayment (e.g. owner mistakenly typed 1500 instead of 1200)
    const updateRepaymentRes = await request(app)
      .put(`/api/wallets/${walletId}/loans/${borrowedLoan.id}/repayments/${repaymentId}`)
      .set("Authorization", "Bearer owner-user")
      .send({
        amount: "1200.00",
        repaymentDate: "2026-09-10",
        notes: "Corrected amount"
      });

    expect(updateRepaymentRes.status).toBe(200);
    const updatedRepayments = updateRepaymentRes.body.wallet.loans[0].repayments;
    expect(updatedRepayments[0].amount).toBe("1200.00");
    expect(updatedRepayments[0].notes).toBe("Corrected amount");

    // 5. Standalone loan with borrower email notifies the matching user
    const createStandaloneRes = await request(app)
      .post("/api/loans")
      .set("Authorization", "Bearer owner-user")
      .send({
        borrowerName: "Dave Outside",
        borrowerEmail: "dave-user@example.com",
        amount: "800.00",
        loanType: "lent",
        lendingDate: "2026-09-12"
      });

    expect(createStandaloneRes.status).toBe(201);
    const standaloneLoan = createStandaloneRes.body.loan;
    expect(standaloneLoan.loan_type).toBe("lent");

    // Check Dave received loan notification
    const daveNotifs = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer dave-user");

    expect(daveNotifs.status).toBe(200);
    const foundNotif = daveNotifs.body.notifications.find((n: any) => n.metadata?.loanId === standaloneLoan.id);
    expect(foundNotif).toBeDefined();

    // 6. Test standalone repayment update
    const addStandaloneRepRes = await request(app)
      .post(`/api/loans/${standaloneLoan.id}/repayments`)
      .set("Authorization", "Bearer owner-user")
      .send({
        amount: "800.00",
        repaymentDate: "2026-09-13"
      });

    expect(addStandaloneRepRes.status).toBe(201);
    const standRepId = addStandaloneRepRes.body.loan.repayments[0].id;

    const updateStandRepRes = await request(app)
      .put(`/api/loans/${standaloneLoan.id}/repayments/${standRepId}`)
      .set("Authorization", "Bearer owner-user")
      .send({
        amount: "750.00"
      });

    expect(updateStandRepRes.status).toBe(200);
    expect(updateStandRepRes.body.loan.repayments[0].amount).toBe("750.00");
  });

  it("provides mirrored view for counterparty member/email with inverted loan_type and allows repayment", async () => {
    const { app } = buildApp();

    // 1. Owner creates a loan lending money to Dave
    const createRes = await request(app)
      .post("/api/loans")
      .set("Authorization", "Bearer owner-user")
      .send({
        creatorName: "Alice Owner",
        borrowerName: "Dave Outside",
        borrowerEmail: "dave-user@example.com",
        amount: "2500.00",
        loanType: "lent",
        lendingDate: "2026-09-10",
        notes: "Project advance"
      });

    expect(createRes.status).toBe(201);
    const loanId = createRes.body.loan.id;
    expect(createRes.body.loan.loan_type).toBe("lent");
    expect(createRes.body.loan.is_owner).toBe(true);
    expect(createRes.body.loan.creator_name).toBe("Alice Owner");

    // 2. Dave logs in and lists loans
    const daveListRes = await request(app)
      .get("/api/loans")
      .set("Authorization", "Bearer dave-user");

    expect(daveListRes.status).toBe(200);
    const daveLoans = daveListRes.body.loans;
    const mirroredLoan = daveLoans.find((l: any) => l.id === loanId);
    expect(mirroredLoan).toBeDefined();

    // Perspective inverted for Dave: lent -> borrowed
    expect(mirroredLoan.loan_type).toBe("borrowed");
    expect(mirroredLoan.is_owner).toBe(false);
    expect(mirroredLoan.amount).toBe("2500.00");
    // Counterparty shown as creator's friendly display name (NOT a raw UUID)
    expect(mirroredLoan.borrower_name).toBe("Alice Owner");
    expect(mirroredLoan.creator_name).toBe("Alice Owner");

    // 3. Dave cannot edit loan terms or delete loan
    const editRes = await request(app)
      .put(`/api/loans/${loanId}`)
      .set("Authorization", "Bearer dave-user")
      .send({ amount: "3000.00" });
    expect(editRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/loans/${loanId}`)
      .set("Authorization", "Bearer dave-user");
    expect(deleteRes.status).toBe(404);

    // 4. Dave CAN record a repayment (pay back the loan)
    const repayRes = await request(app)
      .post(`/api/loans/${loanId}/repayments`)
      .set("Authorization", "Bearer dave-user")
      .send({
        amount: "1000.00",
        repaymentDate: "2026-09-12",
        notes: "First payback"
      });

    expect(repayRes.status).toBe(201);
    expect(repayRes.body.loan.repayments).toHaveLength(1);
    expect(repayRes.body.loan.repayments[0].amount).toBe("1000.00");
    expect(repayRes.body.loan.loan_type).toBe("borrowed");
    expect(repayRes.body.loan.is_owner).toBe(false);

    // 5. Owner checks the loan - sees Dave's repayment, and loan_type is still "lent" for owner
    const ownerListRes = await request(app)
      .get("/api/loans")
      .set("Authorization", "Bearer owner-user");

    const ownerLoan = ownerListRes.body.loans.find((l: any) => l.id === loanId);
    expect(ownerLoan.loan_type).toBe("lent");
    expect(ownerLoan.is_owner).toBe(true);
    expect(ownerLoan.repayments).toHaveLength(1);
    expect(ownerLoan.repayments[0].amount).toBe("1000.00");

    // 6. Owner received an in-box alert about Dave's repayment!
    const ownerNotifs = await request(app)
      .get("/api/notifications")
      .set("Authorization", "Bearer owner-user");

    expect(ownerNotifs.status).toBe(200);
    const repayAlert = ownerNotifs.body.notifications.find((n: any) => n.type === "loan-repayment");
    expect(repayAlert).toBeDefined();
    expect(repayAlert.title).toContain("Repayment");
    expect(repayAlert.message).toContain("1000.00");
  });

  it("prunes read notifications after 24 hours and unread notifications after 1 week", async () => {
    const { store } = buildApp();
    const userId = "prune-test-user";
    const now = new Date("2026-09-20T12:00:00.000Z");

    const memoryNotifications = store.getNotificationsMap();
    memoryNotifications.set("notif-1", {
      id: "notif-1",
      userId,
      type: "daily-log",
      title: "Fresh unread",
      message: "Keep this",
      status: "unread",
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledFor: null,
      metadata: null,
      dedupeKey: "notif:1"
    });

    memoryNotifications.set("notif-2", {
      id: "notif-2",
      userId,
      type: "daily-log",
      title: "Old unread",
      message: "Prune this",
      status: "unread",
      createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledFor: null,
      metadata: null,
      dedupeKey: "notif:2"
    });

    memoryNotifications.set("notif-3", {
      id: "notif-3",
      userId,
      type: "loan-repayment",
      title: "Fresh read",
      message: "Keep this read",
      status: "read",
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      readAt: new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(),
      scheduledFor: null,
      metadata: null,
      dedupeKey: "notif:3"
    });

    memoryNotifications.set("notif-4", {
      id: "notif-4",
      userId,
      type: "loan-repayment",
      title: "Old read",
      message: "Prune this read",
      status: "read",
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      readAt: new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString(),
      scheduledFor: null,
      metadata: null,
      dedupeKey: "notif:4"
    });

    // Prune with reference time `now`
    await store.pruneExpiredBudgetNotifications(now, userId);

    const remaining = [...store.getNotificationsMap().values()].filter((n) => n.userId === userId);
    const titles = remaining.map((n) => n.title);

    expect(titles).toContain("Fresh unread");
    expect(titles).toContain("Fresh read");
    expect(titles).not.toContain("Old unread");
    expect(titles).not.toContain("Old read");
  });
});
