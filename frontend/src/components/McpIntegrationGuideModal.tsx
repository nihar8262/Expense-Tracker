import { useState } from "react";
import { ModalFrame } from "./ui";
import type { Token } from "../services/api";

type McpIntegrationGuideModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tokens: Token[];
  latestToken?: string | null;
};

export function McpIntegrationGuideModal({
  isOpen,
  onClose,
  tokens,
  latestToken
}: McpIntegrationGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"antigravity" | "cursor" | "claude">("antigravity");
  const [connectionMode, setConnectionMode] = useState<"hosted" | "local">("hosted");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const activeTokens = tokens.filter(t => t.revoked_at === null);
  const tokenDisplay = latestToken
    ? latestToken
    : activeTokens.length > 0
    ? `${activeTokens[0].token_prefix}••••••••••••${activeTokens[0].token_suffix}`
    : "YOUR_MCP_TOKEN_HERE";

  const rawTokenOrPlaceholder = latestToken || "YOUR_MCP_TOKEN_HERE";

  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const mcpEndpointUrl = isLocalhost ? "http://localhost:4101/api/mcp" : `${window.location.origin}/api/mcp`;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  // Pre-formatted configurations for Hosted/Remote (Web users)
  const antigravityHostedConfig = `{
  "mcpServers": {
    "expense-tracker": {
      "serverUrl": "${mcpEndpointUrl}",
      "headers": {
        "Authorization": "Bearer ${rawTokenOrPlaceholder}"
      }
    }
  }
}`;

  // Local developer stdio configuration with generic path placeholder
  const antigravityLocalConfig = `{
  "mcpServers": {
    "expense-tracker": {
      "command": "node",
      "args": [
        "<your-folder>\\\\Expense-Tracker\\\\backend\\\\dist\\\\mcp\\\\stdio.js"
      ],
      "env": {
        "EXPENSE_MCP_TOKEN": "${rawTokenOrPlaceholder}"
      }
    }
  }
}`;

  const cursorHostedConfig = `{
  "mcpServers": {
    "expense-tracker": {
      "url": "${mcpEndpointUrl}",
      "headers": {
        "Authorization": "Bearer ${rawTokenOrPlaceholder}"
      }
    }
  }
}`;

  const claudeDesktopHostedConfig = `{
  "mcpServers": {
    "expense-tracker": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpEndpointUrl}",
        "--header",
        "Authorization: Bearer ${rawTokenOrPlaceholder}"
      ]
    }
  }
}`;

  const claudeDesktopLocalConfig = `{
  "mcpServers": {
    "expense-tracker": {
      "command": "node",
      "args": [
        "<your-folder>\\\\Expense-Tracker\\\\backend\\\\dist\\\\mcp\\\\stdio.js"
      ],
      "env": {
        "EXPENSE_MCP_TOKEN": "${rawTokenOrPlaceholder}"
      }
    }
  }
}`;

  return (
    <ModalFrame onClose={onClose} className="max-w-[780px] p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2 border-b border-[color:var(--border)] pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <p className="section-eyebrow text-primary text-xs font-semibold tracking-wider uppercase">
                Model Context Protocol (MCP)
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-ink text-sm p-1 rounded-lg hover:bg-black/5 transition-colors"
            >
              ✕
            </button>
          </div>

          <h2 className="font-display text-2xl sm:text-3xl leading-tight tracking-[-0.03em] text-ink">
            Connect Expense-Tracker to Your AI Agents
          </h2>
          <p className="text-xs sm:text-sm text-secondary leading-relaxed">
            Attach this MCP server to allow AI assistants (like Google Antigravity, Cursor, or Claude) to securely query your expenses, summarize budgets, and perform semantic transaction searches.
          </p>
        </div>

        {/* Token status banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/20 text-xs gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-secondary font-medium">Your Access Token:</span>
            <code className="font-mono text-[11px] bg-white/90 px-2 py-0.5 rounded-lg border border-primary/20 text-primary font-semibold">
              {tokenDisplay}
            </code>
          </div>
          {activeTokens.length === 0 && !latestToken && (
            <span className="text-[11px] text-primary/80 font-medium">
              💡 Generate an access token below first
            </span>
          )}
        </div>

        {/* Mode Selector (Hosted Web App vs Local Developer) */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/[0.03] border border-primary/15">
          <div>
            <span className="text-xs font-bold text-ink block">Deployment Mode</span>
            <span className="text-[11px] text-muted">
              {connectionMode === "hosted"
                ? "Connecting to this website over the internet (No local code needed)"
                : "Running the code locally on your machine via Node.js"}
            </span>
          </div>
          <div className="flex gap-1.5 bg-white/80 p-1 rounded-xl border border-primary/20 shrink-0">
            <button
              type="button"
              onClick={() => setConnectionMode("hosted")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                connectionMode === "hosted"
                  ? "bg-primary text-white shadow-sm"
                  : "text-secondary hover:text-ink"
              }`}
            >
              Cloud / Web App
            </button>
            <button
              type="button"
              onClick={() => setConnectionMode("local")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                connectionMode === "local"
                  ? "bg-primary text-white shadow-sm"
                  : "text-secondary hover:text-ink"
              }`}
            >
              Local Dev (Stdio)
            </button>
          </div>
        </div>

        {/* Platform Tabs */}
        <div className="flex border-b border-[color:var(--border)] gap-2 overflow-x-auto pb-1 text-xs font-medium">
          {[
            { id: "antigravity", label: "Google Antigravity / Gemini" },
            { id: "cursor", label: "Cursor / Windsurf" },
            { id: "claude", label: "Claude Desktop" }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-primary text-white shadow-sm font-semibold"
                  : "text-secondary hover:bg-primary/5 hover:text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Antigravity */}
        {activeTab === "antigravity" && (
          <div className="space-y-4 text-xs leading-relaxed">
            {/* Beginner step: How to find the file */}
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  1
                </span>
                <h4 className="font-bold text-ink text-xs">
                  How to locate or open your Antigravity config file
                </h4>
              </div>

              <p className="text-[11px] text-secondary leading-relaxed">
                Antigravity reads all MCP server connections from a central configuration file named <code className="bg-white/80 px-1.5 py-0.5 rounded border border-primary/20 font-mono text-ink">mcp_config.json</code>. Choose your operating system to open it:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="bg-white/90 p-3 rounded-xl border border-primary/15 space-y-1.5">
                  <div className="font-bold text-ink flex items-center justify-between">
                    <span>🪟 Windows Users:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy("%USERPROFILE%\\.gemini\\config", "win-path")}
                      className="text-[10px] text-primary hover:text-primary/80 font-semibold"
                    >
                      {copiedKey === "win-path" ? "Copied!" : "Copy Path"}
                    </button>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-secondary text-[10px]">
                    <li>Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border text-ink font-mono">Win + R</kbd> on your keyboard.</li>
                    <li>Paste <code className="font-mono bg-primary/5 px-1 py-0.5 rounded text-ink border border-primary/10">%USERPROFILE%\.gemini\config</code> and click OK.</li>
                    <li>Open <code className="font-mono text-ink">mcp_config.json</code> with Notepad or your IDE.</li>
                  </ol>
                </div>

                <div className="bg-white/90 p-3 rounded-xl border border-primary/15 space-y-1.5">
                  <div className="font-bold text-ink flex items-center justify-between">
                    <span>🍎 Mac / Linux Users:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy("~/.gemini/config/mcp_config.json", "mac-path")}
                      className="text-[10px] text-primary hover:text-primary/80 font-semibold"
                    >
                      {copiedKey === "mac-path" ? "Copied!" : "Copy Path"}
                    </button>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-secondary text-[10px]">
                    <li>Open your Terminal.</li>
                    <li>Run: <code className="font-mono bg-primary/5 px-1 py-0.5 rounded text-ink border border-primary/10">open ~/.gemini/config</code> (or nano).</li>
                    <li>Open or edit <code className="font-mono text-ink">mcp_config.json</code>.</li>
                  </ol>
                </div>
              </div>

              <div className="text-[10px] text-secondary pt-1">
                💡 <strong>Inside Antigravity IDE:</strong> You can also simply press <kbd className="px-1 py-0.5 rounded bg-white border font-mono">Ctrl + P</kbd> (or <kbd className="px-1 py-0.5 rounded bg-white border font-mono">Cmd + P</kbd>), type <code className="font-mono font-semibold text-primary">mcp_config.json</code>, and hit Enter!
              </div>
            </div>

            {/* Step 2: Paste Configuration */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  2
                </span>
                <h4 className="font-bold text-ink text-xs">
                  Paste this snippet inside the <code className="font-mono bg-black/5 px-1 py-0.5 rounded">"mcpServers"</code> object:
                </h4>
              </div>

              <div className="relative rounded-2xl bg-zinc-950 p-4 text-zinc-100 font-mono text-[11px] border border-zinc-800">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-800 text-[10px] text-zinc-400">
                  <span>mcp_config.json</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        connectionMode === "hosted" ? antigravityHostedConfig : antigravityLocalConfig,
                        "antigravity"
                      )
                    }
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded-md text-[10px] transition-colors font-medium"
                  >
                    {copiedKey === "antigravity" ? "✓ Copied!" : "Copy JSON"}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre">
                  {connectionMode === "hosted" ? antigravityHostedConfig : antigravityLocalConfig}
                </pre>
              </div>
            </div>

            {/* Step 3: Save and Ready */}
            <div className="flex items-center gap-2 pt-1 text-muted text-[11px]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                3
              </span>
              <span>Save the file. Antigravity will instantly discover the Expense-Tracker tools without needing to reload!</span>
            </div>
          </div>
        )}

        {/* Tab 2: Cursor & Windsurf */}
        {activeTab === "cursor" && (
          <div className="space-y-4 text-xs leading-relaxed">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  1
                </span>
                <h4 className="font-bold text-ink text-xs">Open Cursor MCP Settings</h4>
              </div>
              <p className="text-secondary pl-7">
                Navigate to <strong>Cursor Settings &gt; Features &gt; MCP</strong> and click <strong>+ Add New MCP Server</strong>.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  2
                </span>
                <h4 className="font-bold text-ink text-xs">Configure Server Details</h4>
              </div>
              <div className="pl-7 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-primary/[0.03] p-3 rounded-xl border border-primary/15 text-[11px]">
                <div>
                  <span className="text-muted block text-[10px]">Server Name</span>
                  <strong className="text-ink font-mono">expense-tracker</strong>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Type</span>
                  <strong className="text-ink font-mono">sse</strong>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Server URL</span>
                  <strong className="text-primary font-mono text-[10px] break-all">{mcpEndpointUrl}</strong>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  3
                </span>
                <h4 className="font-bold text-ink text-xs">Or use .cursor/mcp.json file directly</h4>
              </div>

              <div className="relative rounded-2xl bg-zinc-950 p-4 text-zinc-100 font-mono text-[11px] border border-zinc-800">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-800 text-[10px] text-zinc-400">
                  <span>.cursor/mcp.json</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(cursorHostedConfig, "cursor")}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded-md text-[10px] transition-colors font-medium"
                  >
                    {copiedKey === "cursor" ? "✓ Copied!" : "Copy JSON"}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre">{cursorHostedConfig}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Claude Desktop */}
        {activeTab === "claude" && (
          <div className="space-y-4 text-xs leading-relaxed">
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  1
                </span>
                <h4 className="font-bold text-ink text-xs">Locate Claude Desktop Configuration</h4>
              </div>
              <p className="text-[11px] text-secondary leading-relaxed">
                Claude Desktop looks for a configuration file named <code className="bg-white/80 px-1 py-0.5 rounded font-mono border border-primary/20">claude_desktop_config.json</code>:
              </p>
              <div className="space-y-1 text-[10px] font-mono text-secondary bg-white/80 p-2.5 rounded-xl border border-primary/15">
                <div><strong>Windows:</strong> %APPDATA%\Claude\claude_desktop_config.json</div>
                <div><strong>macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  2
                </span>
                <h4 className="font-bold text-ink text-xs">
                  Paste into <code className="font-mono bg-black/5 px-1 py-0.5 rounded">"mcpServers"</code>:
                </h4>
              </div>

              <div className="relative rounded-2xl bg-zinc-950 p-4 text-zinc-100 font-mono text-[11px] border border-zinc-800">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-800 text-[10px] text-zinc-400">
                  <span>claude_desktop_config.json</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        connectionMode === "hosted" ? claudeDesktopHostedConfig : claudeDesktopLocalConfig,
                        "claude"
                      )
                    }
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded-md text-[10px] transition-colors font-medium"
                  >
                    {copiedKey === "claude" ? "✓ Copied!" : "Copy JSON"}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre">
                  {connectionMode === "hosted" ? claudeDesktopHostedConfig : claudeDesktopLocalConfig}
                </pre>
              </div>

              {connectionMode === "hosted" && (
                <p className="text-[10px] text-muted leading-relaxed">
                  Note: For web-hosted connections, Claude Desktop connects through <code className="bg-black/5 px-1 py-0.5 rounded">mcp-remote</code> (automatically downloaded by npx without installing anything).
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1 text-muted text-[11px]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                3
              </span>
              <span>Restart Claude Desktop. The hammer icon in chat will now show Expense-Tracker tools.</span>
            </div>
          </div>
        )}

        {/* Tools Reference */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
            <span>🛠️ Available Tools Your AI Agent Can Use:</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-white/80 border border-primary/15">
              <code className="font-semibold text-primary">list_expenses</code>
              <p className="text-muted text-[10px]">Filter expenses by category or date range.</p>
            </div>
            <div className="p-2 rounded-xl bg-white/80 border border-primary/15">
              <code className="font-semibold text-primary">get_expense_summary</code>
              <p className="text-muted text-[10px]">Aggregated totals & category breakdown.</p>
            </div>
            <div className="p-2 rounded-xl bg-white/80 border border-primary/15">
              <code className="font-semibold text-primary">search_expenses_semantic</code>
              <p className="text-muted text-[10px]">Natural language search over transactions.</p>
            </div>
            <div className="p-2 rounded-xl bg-white/80 border border-primary/15">
              <code className="font-semibold text-primary">list_wallets / get_wallet_balance</code>
              <p className="text-muted text-[10px]">Inspect shared group wallets and balances.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button type="button" className="ui-button-primary px-5 text-xs py-2" onClick={onClose}>
            Done & Close
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
