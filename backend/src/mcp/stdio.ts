import readline from "node:readline";
import path from "node:path";
import dotenv from "dotenv";
import postgres from "postgres";
import { createPostgresExpenseStore } from "../store/postgres.js";
import { getTools } from "../assistant/tools.js";
import { getTokenStore } from "./tokenStore.js";

// Load .env reliably regardless of working directory
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[expense-tracker-mcp] ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const sql = postgres(connectionString);
const store = createPostgresExpenseStore();
const tokenStore = getTokenStore(store);
const tools = getTools(store).filter(t => t.name !== "create_expense");

async function resolveUserId(): Promise<string> {
  if (process.env.EXPENSE_USER_ID) {
    return process.env.EXPENSE_USER_ID;
  }
  if (process.env.EXPENSE_MCP_TOKEN) {
    const authenticated = await tokenStore.authenticateToken(process.env.EXPENSE_MCP_TOKEN);
    if (authenticated) {
      return authenticated;
    }
    console.error("[expense-tracker-mcp] Warning: EXPENSE_MCP_TOKEN could not be validated. Falling back to default user.");
  }

  try {
    const users = await sql`SELECT user_id FROM expenses ORDER BY date DESC LIMIT 1`;
    if (users.length > 0 && users[0].user_id) {
      return users[0].user_id;
    }
  } catch (err: any) {
    console.error("[expense-tracker-mcp] Error resolving user from expenses:", err.message);
  }

  return "legacy-anonymous";
}

function sendResponse(response: any) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function handleMessage(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message: any;
  try {
    message = JSON.parse(trimmed);
  } catch (err) {
    console.error("[expense-tracker-mcp] Invalid JSON received on stdin:", trimmed);
    return;
  }

  const { jsonrpc, id, method, params } = message;
  if (jsonrpc !== "2.0") {
    if (id !== undefined) {
      sendResponse({
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "Invalid Request: jsonrpc must be '2.0'" }
      });
    }
    return;
  }

  // Handle notifications (no id)
  if (id === undefined) {
    if (method === "notifications/initialized") {
      console.error("[expense-tracker-mcp] Client initialized.");
    }
    return;
  }

  try {
    if (method === "initialize") {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "expense-tracker-mcp",
            version: "1.0.0"
          }
        }
      });
    } else if (method === "ping") {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {}
      });
    } else if (method === "tools/list") {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters
          }))
        }
      });
    } else if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool '${name}' not found.` }
        });
        return;
      }

      const userId = await resolveUserId();
      try {
        const toolResult = await tool.handler(args || {}, userId);
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolResult, null, 2)
              }
            ]
          }
        });
      } catch (toolErr: any) {
        console.error(`[expense-tracker-mcp] Error executing ${name}:`, toolErr);
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Tool execution failed: ${toolErr.message}` }, null, 2)
              }
            ],
            isError: true
          }
        });
      }
    } else {
      sendResponse({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method '${method}' not supported.` }
      });
    }
  } catch (err: any) {
    console.error("[expense-tracker-mcp] Internal error handling request:", err);
    sendResponse({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err.message || "Internal server error." }
    });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", (line) => {
  handleMessage(line).catch((err) => {
    console.error("[expense-tracker-mcp] Unhandled error in line handler:", err);
  });
});

rl.on("close", async () => {
  console.error("[expense-tracker-mcp] Stdin closed, shutting down.");
  await sql.end();
  process.exit(0);
});

console.error("[expense-tracker-mcp] Stdio server started and listening on stdin.");
