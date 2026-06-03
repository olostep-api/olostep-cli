# olostep-cli

[![npm](https://img.shields.io/npm/v/olostep-cli.svg)](https://www.npmjs.com/package/olostep-cli)
[![Downloads](https://img.shields.io/npm/dm/olostep-cli.svg)](https://www.npmjs.com/package/olostep-cli)
[![CI](https://github.com/olostep-api/olostep-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/olostep-api/olostep-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/olostep-cli.svg)](https://nodejs.org)

The official CLI for the [Olostep API](https://www.olostep.com/) — scrape, search, crawl, map, and batch the web from your terminal. Every data command returns **JSON on stdout**, so it pipes cleanly into `jq`, scripts, agents, and CI.

Pure JavaScript, Node 18+, no native binaries to download. Installs in under a second, starts in ~200 ms, ships as a single ~100 KB bundle.

---

## Install

```bash
npm install -g olostep-cli
olostep init
```

Requires Node.js **18+**.

**One-liner alternatives** (no manual `npm` step):

```bash
# macOS / Linux
curl -fsSL https://olostep.com/install.sh | sh

# Windows PowerShell
iwr -useb https://olostep.com/install.ps1 | iex
```

`olostep init` is the recommended first step — it signs you in, installs the Olostep skills into every detected AI agent, and configures the MCP server, all in one go.

To **just sign in**: `olostep login` (or `--no-browser` for SSH).
To **sign out**: `olostep logout`.
For CI/agents: set `OLOSTEP_API_KEY=...`.
Get a key at <https://www.olostep.com/dashboard/api-keys>.

Or try without installing: `npx -y olostep-cli@latest --help`.

---

## Quick start

```bash
# Pull one URL as clean markdown
olostep scrape "https://example.com" --formats markdown

# Live web search
olostep search "best web scraping APIs 2025" --limit 10

# Discover all URLs on a site
olostep map "https://example.com" --top-n 20

# AI-researched answer with citations
olostep answer "What does Olostep do?"

# Crawl every page on a site
olostep crawl "https://docs.example.com" --max-pages 50

# Scrape many URLs from a CSV, in parallel
olostep batch-scrape urls.csv --formats markdown,html
```

Pipes stay clean — logs go to stderr, JSON to stdout:

```bash
olostep map "https://example.com" | jq '.urls[:10]'
olostep scrape "https://example.com" | jq -r '.result.markdown_content'
olostep search "topic" --json | jq '.links[].url'
```

---

## Commands

Run `olostep <command> --help` for the full flag list.

### Auth

| Command | What it does |
| --- | --- |
| `olostep login` | Browser PKCE sign-in |
| `olostep logout` | Remove saved credentials |
| `olostep init` | Login + install skills + install MCP server |
| `olostep status` | Show auth status and config paths |
| `olostep auth login` | Alias for `olostep login` |
| `olostep auth logout` | Alias for `olostep logout` |
| `olostep auth status` | Alias for `olostep status` |
| `olostep auth set-key <key>` | Save an API key directly (no browser needed) |

### Data commands

| Command | What it does |
| --- | --- |
| `olostep scrape <url>` | Turn a URL into markdown, HTML, JSON, text, PDF, or screenshot |
| `olostep scrape-get <id>` | Re-fetch a prior scrape by ID |
| `olostep search <query>` | Live web search — returns deduplicated links with title + description |
| `olostep map <url>` | Discover every URL on a site |
| `olostep answer <question>` | AI-researched, cited answer from live web data |
| `olostep crawl <url>` | Crawl an entire site (async, polls until done) |
| `olostep batch-scrape <urls.csv>` | Scrape up to 10 000 URLs in parallel |
| `olostep batch-update <batch_id>` | Update metadata on a batch job |

**Common flags** on every data command: `--out <path>` (write JSON to file, default stdout), `--timeout <seconds>`, `--api-key <key>`.

`olostep search` extra flags: `--limit <n>` (default 12, max 25), `--include-domains <list>`, `--exclude-domains <list>`.

### Skills

```bash
olostep add skills                    # install all skills into every detected agent
olostep skills install                # same (alias)
olostep skills list                   # show what's installed and where
olostep skills update                 # re-install / overwrite existing skills
olostep skills uninstall              # remove all skills
```

### MCP server

```bash
olostep mcp install                   # detect agents, use hosted endpoint (default)
olostep mcp install --agent cursor    # target one agent
olostep mcp install --transport stdio # local `npx olostep-mcp` instead
olostep mcp install --no-global       # project-scoped config
olostep mcp install --dry-run --json  # show the plan, don't write
olostep list mcp                      # see where it's installed
olostep mcp uninstall                 # remove the olostep entry
```

### Health & diagnostics

| Command | What it does |
| --- | --- |
| `olostep doctor` | Run health checks — auth, API reachability, MCP endpoint, agent configs |
| `olostep doctor --json` | NDJSON output (one record per check) — good for CI |
| `olostep doctor --skip-network` | Auth + config checks only, no network calls |
| `olostep doctor --fail-on-warn` | Exit 1 on any warning too |
| `olostep version` | Show CLI version, Node version, channel |
| `olostep version --json` | Machine-readable: `{ cli, node, channel }` |
| `olostep update` | Update to the latest version |

---

## Skills for AI agents

`olostep add skills` installs **13 skill files** — `SKILL.md` files that land in Claude Code, Cursor, and other agents so they know what Olostep can do and when to use it.

### Setup

| Skill | What it does |
| --- | --- |
| `setup` | Teaches the agent how to configure the Olostep MCP server. Use this first. |

### Core web data

| Skill | What it does |
| --- | --- |
| `scrape` | Turn one URL into clean markdown / HTML / JSON / text |
| `search` | Live web search — results, answers, and in-site URL discovery |
| `answers` | Cited, structured answers from live web data |
| `crawl` | Autonomously crawl a whole site |
| `map` | Discover every URL on a site |
| `batch` | Scrape up to 10 000 URLs in parallel |
| `extract-schema` | Scrape a page into structured JSON matching a schema |

### Build & integrate

| Skill | What it does |
| --- | --- |
| `integrate` | Auto-install the Olostep SDK into a project |
| `docs-to-code` | Scrape API docs and write working code from them |
| `migrate-code` | Read a migration guide and update local code |

### Research & debug

| Skill | What it does |
| --- | --- |
| `research` | Cited, comparative web research for a decision |
| `debug-error` | Look up an error message against live GitHub / SO / docs |

```bash
olostep add skills                              # all 13
olostep add skills --category usage             # core data skills only
olostep add skills --skill scrape --skill map   # cherry-pick
olostep add skills --agent cursor --agent claude
olostep list skills --json
```

Other flags: `--exclude <name>`, `--global` / `--no-global`, `--link-mode <auto|symlink|copy>`, `--overwrite` / `--no-overwrite`.

**Supported agents for skills:** Cursor, Claude, Codex, Windsurf, Continue, Augment, Roo, Gemini, Copilot, Factory.

---

## MCP server install

The CLI writes the Olostep MCP server entry into your agent's config — no JSON editing needed.

**Two transports:**

- **`http`** *(default)* — hosted at `https://mcp.olostep.com/mcp`. No local process, no Node dependency for the agent.
- **`stdio`** — runs `npx -y olostep-mcp` locally. Useful for offline / corporate-proxy setups.

The installer merges only the `olostep` key into your existing config without touching other servers. Restart your agent after install.

**Supported agents for MCP install:** Cursor, Claude Code, Claude Desktop, Windsurf, VS Code, Kilo, OpenCode, Continue, Codex.

---

## Auth & config

API key resolution order (first match wins):

1. `--api-key <key>` flag
2. `OLOSTEP_API_KEY` env var
3. `OLOSTEP_API_TOKEN` env var
4. `.env` file in the current directory
5. Saved credentials (`olostep login` / `olostep auth set-key`)

Credentials are shared with the Python CLI — existing users keep their login after upgrading.

| OS | Credentials path |
| --- | --- |
| macOS | `~/Library/Application Support/olostep-cli/credentials.json` |
| Linux | `~/.config/olostep-cli/credentials.json` |
| Windows | `%USERPROFILE%\AppData\Roaming\olostep-cli\credentials.json` |

**Environment variables:**

| Variable | Effect |
| --- | --- |
| `OLOSTEP_API_KEY` | API key |
| `OLOSTEP_API_TOKEN` | API key (legacy alias) |
| `OLOSTEP_JSON=1` | Force JSON output on every command (same as passing `--json` globally) |
| `OLOSTEP_NO_UPDATE_CHECK=1` | Silence the "update available" notice |
| `OLOSTEP_CLI_CONFIG_DIR` | Override the credentials directory |

---

## Tips

**PowerShell** tokenizes `,` and `*` differently — quote arguments:

```powershell
olostep scrape "https://example.com" --formats "markdown,html"
olostep map   "https://example.com" --include-url "/*"
olostep answer "Extract facts" --json-format '{"company":"","year":""}'
```

**CI / agents** — set `OLOSTEP_API_KEY` and optionally `OLOSTEP_JSON=1` to always get machine-readable output:

```bash
OLOSTEP_API_KEY=sk_... OLOSTEP_JSON=1 olostep scrape "https://example.com"
```

**Health check in CI:**

```bash
olostep doctor --json --skip-network | jq 'select(.status == "fail")'
```

---

## Links

- **Olostep** — <https://www.olostep.com>
- **Docs** — <https://docs.olostep.com> · [CLI docs](https://docs.olostep.com/sdks/cli)
- **API keys** — <https://www.olostep.com/dashboard/api-keys>
- **npm** — <https://www.npmjs.com/package/olostep-cli>
- **GitHub** — <https://github.com/olostep-api/olostep-cli>

---

## License

MIT — see [`LICENSE`](./LICENSE).
