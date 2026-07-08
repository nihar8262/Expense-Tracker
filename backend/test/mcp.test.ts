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

describe("MCP and Token Management APIs", () => {
  it("implements full token lifecycle and secure scope-scoped access", async () => {
    const app = buildApp();

    // 1. Initially, user has no tokens
    const listRes1 = await request(app)
      .get("/api/tokens")
      .set("Authorization", "Bearer user-a");
    expect(listRes1.status).toBe(200);
    expect(listRes1.body.tokens).toHaveLength(0);

    // 2. Generate a new token
    const createRes = await request(app)
      .post("/api/tokens")
      .set("Authorization", "Bearer user-a")
      .send({ label: "Claude Desktop" });
    
    expect(createRes.status).toBe(201);
    expect(createRes.body.token).toBeDefined();
    expect(createRes.body.token).toContain("mcp_");
    expect(createRes.body.label).toBe("Claude Desktop");

    const rawToken = createRes.body.token;
    const tokenId = createRes.body.id;

    // 3. User lists tokens and sees masked token details
    const listRes2 = await request(app)
      .get("/api/tokens")
      .set("Authorization", "Bearer user-a");
    expect(listRes2.status).toBe(200);
    expect(listRes2.body.tokens).toHaveLength(1);
    expect(listRes2.body.tokens[0].label).toBe("Claude Desktop");
    expect(listRes2.body.tokens[0].token_prefix).toBeDefined();
    expect(listRes2.body.tokens[0].token_suffix).toBeDefined();
    expect(listRes2.body.tokens[0].token_hash).toBeUndefined(); // Verify hash is never exposed!

    // 4. MCP Server: unauthorized requests are blocked
    const mcpUnauth = await request(app)
      .post("/api/mcp")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      });
    expect(mcpUnauth.status).toBe(401);

    const mcpGarbage = await request(app)
      .post("/api/mcp")
      .set("Authorization", "Bearer invalid-token-format")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      });
    expect(mcpGarbage.status).toBe(401);

    // 5. MCP Server: authorized initialization
    const mcpInit = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${rawToken}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {}
      });
    expect(mcpInit.status).toBe(200);
    expect(mcpInit.body.result.serverInfo.name).toBe("expense-tracker-mcp");

    // 6. MCP Server: tools/list lists read-only tools, but excludes write tools
    const mcpList = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${rawToken}`)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      });
    expect(mcpList.status).toBe(200);
    const tools = mcpList.body.result.tools;
    expect(tools).toBeDefined();
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("list_expenses");
    expect(toolNames).toContain("get_expense_summary");
    expect(toolNames).toContain("list_wallets");
    expect(toolNames).toContain("get_wallet_balance");
    expect(toolNames).not.toContain("create_expense"); // Non-negotiable read-only first

    // 7. Seed some expenses for user-a and user-b to check scope security
    // user-a seeds
    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-a")
      .set("Idempotency-Key", "a-exp1")
      .send({
        amount: "50.00",
        category: "Food",
        description: "User A Dinner",
        date: "2026-07-08"
      });

    // user-b seeds
    await request(app)
      .post("/api/expenses")
      .set("Authorization", "Bearer user-b")
      .set("Idempotency-Key", "b-exp1")
      .send({
        amount: "100.00",
        category: "Travel",
        description: "User B Taxi",
        date: "2026-07-08"
      });

    // 8. MCP Server: execute list_expenses under User A's token
    const mcpCall = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${rawToken}`)
      .send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "list_expenses",
          arguments: {}
        }
      });
    
    expect(mcpCall.status).toBe(200);
    const content = JSON.parse(mcpCall.body.result.content[0].text);
    expect(content.expenses).toHaveLength(1);
    expect(content.expenses[0].description).toBe("User A Dinner"); // Strictly scoped to user-a
    expect(content.expenses[0].amount).toBe("50.00");

    // 9. Revoke the token (soft-delete)
    const revokeRes = await request(app)
      .delete(`/api/tokens/${tokenId}`)
      .set("Authorization", "Bearer user-a");
    expect(revokeRes.status).toBe(204);

    // Verify token is listed as revoked
    const listRes3 = await request(app)
      .get("/api/tokens")
      .set("Authorization", "Bearer user-a");
    expect(listRes3.status).toBe(200);
    expect(listRes3.body.tokens).toHaveLength(1);
    expect(listRes3.body.tokens[0].revoked_at).not.toBeNull();

    // 10. Verify the token is immediately invalidated
    const mcpRevokedCall = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${rawToken}`)
      .send({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "list_expenses",
          arguments: {}
        }
      });
    expect(mcpRevokedCall.status).toBe(401);

    // 11. Purge the token (hard-delete)
    const purgeRes = await request(app)
      .delete(`/api/tokens/${tokenId}?purge=true`)
      .set("Authorization", "Bearer user-a");
    expect(purgeRes.status).toBe(204);

    // Verify it is completely removed from list
    const listRes4 = await request(app)
      .get("/api/tokens")
      .set("Authorization", "Bearer user-a");
    expect(listRes4.status).toBe(200);
    expect(listRes4.body.tokens).toHaveLength(0);
  });
});
