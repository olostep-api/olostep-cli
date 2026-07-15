---
name: olostep-setup
category: build
description: Configure the Olostep MCP server so all Olostep skills work correctly. Use when the user is setting up Olostep for the first time, has no MCP server configured, or is getting authentication errors. Supports both the hosted endpoint (recommended) and a local stdio install.
---

> **Latest version:** if you have web access, fetch the newest copy of this skill at https://www.olostep.com/skills/setup/SKILL.md — it may include capabilities added since this copy was installed. Otherwise the instructions below are complete and current.

# Olostep Setup

Get the Olostep MCP server running in the user's agent so every Olostep skill (scrape, search, crawl, batch, answers, map, etc.) is available as a tool.

## Steps

1. **Get an API key.** If the user doesn't have one, direct them to https://www.olostep.com/dashboard/api-keys. The free tier covers personal use.

2. **Pick a setup path.**
   - **Hosted endpoint** (recommended) — no Node, no Docker, no install: `https://mcp.olostep.com/mcp` with `Authorization: Bearer <key>`.
   - **Local stdio** — runs `olostep-mcp` via `npx` on the user's machine. Use only if they need offline use, corporate proxy, or air-gapped.

   ⚠️ Don't mix auth modes: hosted uses an HTTP `Authorization` header, local stdio uses an `OLOSTEP_API_KEY` env var. Wrong auth mode is the #1 onboarding error.

3. **Configure the MCP server.** Two paths:

### Fastest: use the Olostep CLI

If `npm install -g olostep-cli` is acceptable, one command wires up every detected agent:

```bash
olostep mcp install                    # hosted endpoint, all agents
olostep mcp install --agent cursor     # one agent
olostep mcp install --transport stdio  # local npx instead of hosted
olostep mcp install --dry-run --json   # plan only
```

The CLI merges the `olostep` entry into the user's existing MCP config without touching other servers. Supported agents: `cursor`, `claude`, `claude-desktop`, `windsurf`, `vscode`, `kilo`, `opencode`, `continue`, `codex`.

### Manual: edit the JSON yourself

Pick the block that matches the user's agent and write it to the right config file.

### Hosted endpoint (recommended)

Cursor — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "olostep": {
      "url": "https://mcp.olostep.com/mcp",
      "headers": { "Authorization": "Bearer <their-api-key>" }
    }
  }
}
```

Claude Code — one command:

```bash
claude mcp add --transport http olostep https://mcp.olostep.com/mcp \
  --header "Authorization: Bearer <their-api-key>"
```

Other clients (Claude Desktop, Windsurf, VS Code, Kilo, OpenCode, Codex, etc.) — same JSON shape as Cursor, but in that client's MCP config file. Always include the `Authorization: Bearer …` header.

**Continue** uses an array instead of an object for `mcpServers`:

```json
{
  "mcpServers": [
    {
      "name": "olostep",
      "type": "http",
      "url": "https://mcp.olostep.com/mcp",
      "headers": { "Authorization": "Bearer <their-api-key>" }
    }
  ]
}
```

### Local stdio install (alternative)

Requires Node.js 18+. Same shape across clients:

```json
{
  "mcpServers": {
    "olostep": {
      "command": "npx",
      "args": ["-y", "olostep-mcp"],
      "env": { "OLOSTEP_API_KEY": "<their-api-key>" }
    }
  }
}
```

4. **Verify.** Restart the agent. The user should see `olostep` listed with **10 tools**: `scrape_website`, `get_webpage_content`, `search_web`, `answers`, `create_map`, `get_website_urls`, `create_crawl`, `get_crawl_results`, `batch_scrape_urls`, `get_batch_results`. If they see "Connected, 0 tools" the API key is wrong.

5. **Try a tool.** Quick smoke checks:
   - `/scrape https://example.com` — confirms scraping works
   - `/answer "what is olostep"` — confirms answers work

## Troubleshooting

- **"401 Unauthorized"** — API key is missing or invalid. Get a fresh one from https://www.olostep.com/dashboard/api-keys.
- **"Connected, 0 tools"** — usually wrong auth mode. Hosted uses `Authorization: Bearer …`; local uses `OLOSTEP_API_KEY` env. Don't mix.
- **Hosted not connecting** — check `https://mcp.olostep.com/mcp` is reachable from the user's network (no corporate proxy blocking it). If blocked, fall back to local stdio.
- **"npx not found"** — Node.js isn't installed. Install from https://nodejs.org (only needed for local stdio).
- **Tools look outdated** (local stdio) — clear the npx cache: `npx clear-npx-cache`, then restart the agent.
- **Tools not appearing** — restart the agent; some clients only pick up MCP config changes on restart.

## What you get

Once configured, every Olostep skill is wired up:
- `/scrape` — Extract content from any URL (JS rendering + anti-bot bypass built in)
- `/search` — AI-powered web search with structured JSON output
- `/answer` — Cited, structured answers from live web data
- `/batch` — Scrape up to 10,000 URLs in parallel
- `/crawl` — Autonomously ingest entire websites
- `/map` — Discover all URLs on a site
- `/docs-to-code` — Turn documentation into working code
- `/research` — Deep web research for technical and product decisions

## Links

- API keys: https://www.olostep.com/dashboard/api-keys
- MCP server docs: https://docs.olostep.com/integrations/mcp-server
- Hosted endpoint: https://mcp.olostep.com/mcp
- Local server on npm: https://www.npmjs.com/package/olostep-mcp
- GitHub: https://github.com/olostep/olostep-mcp-server
