const { authenticateMcpRequest, McpAuthenticationError } = require("./_lib/mcp-auth");
const { tools } = require("./_lib/assistant-tools");
const { checkRateLimit } = require("./_lib/rate-limiter");

const readOnlyTools = tools.filter(t => t.name !== "create_expense");

const sessions = new Map();

module.exports = async function handler(request, response) {
  const method = request.method;

  if (method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const sessionId = request.query.sessionId || require("crypto").randomUUID();
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

    return;
  }

  if (method === "POST") {
    let user;
    try {
      user = await authenticateMcpRequest(request);
    } catch (error) {
      if (error instanceof McpAuthenticationError) {
        return response.status(401).json({ error: error.message });
      }
      return response.status(500).json({ error: "Authentication failed." });
    }

    try {
      const rateLimitKey = `mcp:${user.id}`;
      const limitResult = await checkRateLimit(rateLimitKey, "mcp");
      if (!limitResult.allowed) {
        return response.status(429).json({ error: "Too many requests. Please try again later." });
      }
    } catch (err) {
      console.error("Rate limit check error:", err);
    }

    const { jsonrpc, id, method: mcpMethod, params } = request.body || {};
    if (jsonrpc !== "2.0") {
      return response.status(400).json({ error: "Invalid JSON-RPC version." });
    }

    const sessionId = request.query.sessionId;

    let result = null;
    let error = null;

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
          return response.status(200).end();
        }
        error = { code: -32601, message: `Method ${mcpMethod} not implemented.` };
      }
    } catch (err) {
      error = { code: -32603, message: err.message || "Internal server error." };
    }

    const jsonRpcResponse = {
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
      s.write(`event: message\ndata: ${JSON.stringify(jsonRpcResponse)}\n\n`);
    }

    return response.status(200).json(jsonRpcResponse);
  }

  response.setHeader("Allow", "GET, POST");
  return response.status(405).end("Method Not Allowed");
};
