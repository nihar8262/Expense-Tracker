import type express from "express";
import crypto from "node:crypto";
import type { ExpenseStore } from "../store/types.js";
import { getTools } from "../assistant/tools.js";
import { getTokenStore } from "./tokenStore.js";
import { authenticateMcpRequest, McpAuthenticationError } from "./auth.js";

const sessions = new Map<string, express.Response>();

export function registerMcpRoutes(app: express.Express, store: ExpenseStore) {
  const tokenStore = getTokenStore(store);
  const readOnlyTools = getTools(store).filter(t => t.name !== "create_expense");

  app.get("/api/mcp", (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const sessionId = (request.query.sessionId as string) || crypto.randomUUID();
    sessions.set(sessionId, response);

    const messageUrl = `/api/mcp?sessionId=${sessionId}`;
    response.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

    const keepAlive = setInterval(() => {
      response.write(":\n\n");
    }, 15000);

    request.on("close", () => {
      clearInterval(keepAlive);
      sessions.delete(sessionId);
    });
  });

  app.post("/api/mcp", async (request, response) => {
    let user;
    try {
      user = await authenticateMcpRequest(request, tokenStore);
    } catch (error) {
      if (error instanceof McpAuthenticationError) {
        return response.status(401).json({ error: error.message });
      }
      return response.status(500).json({ error: "Authentication failed." });
    }

    const { jsonrpc, id, method: mcpMethod, params } = request.body || {};
    if (jsonrpc !== "2.0") {
      return response.status(400).json({ error: "Invalid JSON-RPC version." });
    }

    const sessionId = request.query.sessionId as string;

    let result: any = null;
    let error: any = null;

    try {
      if (mcpMethod === "initialize") {
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "expense-tracker-mcp",
            version: "1.0.0"
          }
        };
      } else if (mcpMethod === "tools/list") {
        result = {
          tools: readOnlyTools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters
          }))
        };
      } else if (mcpMethod === "tools/call") {
        const { name, arguments: args } = params || {};
        const tool = readOnlyTools.find(t => t.name === name);
        if (!tool) {
          error = { code: -32601, message: `Tool ${name} not found.` };
        } else {
          const toolResult = await tool.handler(args || {}, user.id);
          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolResult, null, 2)
              }
            ]
          };
        }
      } else {
        if (id === undefined) {
          return response.sendStatus(200);
        }
        error = { code: -32601, message: `Method ${mcpMethod} not implemented.` };
      }
    } catch (err: any) {
      error = { code: -32603, message: err.message || "Internal server error." };
    }

    const jsonRpcResponse: any = {
      jsonrpc: "2.0",
      id
    };

    if (error) {
      jsonRpcResponse.error = error;
    } else {
      jsonRpcResponse.result = result;
    }

    if (sessionId && sessions.has(sessionId)) {
      const s = sessions.get(sessionId);
      s?.write(`event: message\ndata: ${JSON.stringify(jsonRpcResponse)}\n\n`);
    }

    return response.status(200).json(jsonRpcResponse);
  });
}
