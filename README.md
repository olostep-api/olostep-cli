# olostep-cli

[![npm](https://img.shields.io/npm/v/olostep-cli.svg)](https://www.npmjs.com/package/olostep-cli)
[![Downloads](https://img.shields.io/npm/dm/olostep-cli.svg)](https://www.npmjs.com/package/olostep-cli)
[![CI](https://github.com/olostep-api/olostep-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/olostep-api/olostep-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/olostep-cli.svg)](https://nodejs.org)

The official CLI for the [Olostep API](https://www.olostep.com/) — scrape, map, crawl, AI-researched answers, and parallel batch jobs from your terminal. Every data command returns **JSON on stdout**, so it pipes cleanly into `jq`, scripts, agents, and CI.

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

Both scripts check Node 18+, run `npm install -g olostep-cli` (with a sudo fallback on bash), and tell you to run `olostep init` next.

`olostep init` is the recommended first step — it signs you in, installs the Olostep skills into every detected AI agent, and configures the MCP server, all in one go. Flags: `--skills-only`, `--mcp-only`, `--no-browser`, `--relogin`.

To **just sign in** (no skills, no MCP): `olostep login` (or `--no-browser` for SSH). To **sign out**: `olostep logout` (`--dry-run` to preview). For CI, set `OLOSTEP_API_KEY=...`. Get a key at <https://www.olostep.com/dashboard/api-keys>.

Or try it without installing: `npx -y olostep-cli@latest --help`.

---

## Quick start

```bash
# Pull one URL as clean markdown
olostep scrape "https://example.com" --formats markdown

# Discover URLs on a site
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
```

---

## Commands

Run `olostep <command> --help` for the full flag list.

| Command | What it does |
| --- | --- |
| `olostep login` | Browser PKCE sign-in |
| `olostep logout` | Remove saved credentials (confirms first); warns if env vars still hold a key. `--yes` skips prompt, `--dry-run` previews |
| `olostep init` | Login + install skills + install MCP server (recommended first step) |
| `olostep status` | Show version, auth, config dir (`--json` for machine output) |
| `olostep update` | `npm install -g olostep-cli@latest` (`--check` to check only) |
| `olostep scrape <url>` | One URL → markdown / html / text / json / raw_pdf / screenshot |
| `olostep scrape-get <id>` | Refetch a previous scrape by ID |
| `olostep map <url>` | Discover URLs on a site (filter by query or pattern) |
| `olostep answer <task>` | AI-researched answer with citations (synchronous) |
| `olostep crawl <url>` | Crawl a whole site, polls until done (filters, robots.txt, dry-run) |
| `olostep batch-scrape <csv>` | Up to 10,000 URLs in parallel from a CSV |
| `olostep batch-update <id>` | Update batch metadata |
| `olostep add skills` / `remove skills` / `list skills` | Manage Olostep skills in your AI agents |
| `olostep mcp install` / `mcp uninstall` / `list mcp` | Install the Olostep MCP server into your agents |

**Common flags** on every data command: `--out <path>` (write JSON to a file, default stdout), `--timeout <seconds>` (HTTP timeout), `--api-key <key>` (override the resolved key for one run).

---

## Output

Every data command prints its JSON result to **stdout** by default. Pass `--out <path>` to write to a file instead.

| Flag | Behavior |
| --- | --- |
| *(none)* | Pretty-printed JSON to **stdout** |
| `--out <path>` | Write JSON to that file (parent dirs created) |
| `--out -` | Explicit stdout (same as default) |

Management commands (`status`, `list`, `add/remove skills`, `mcp install/uninstall`) print human-readable text by default; pass `--json` for machine output. Progress and logs always go to **stderr**, so stdout stays clean.

---

## Skills for AI agents

The CLI ships **13 Olostep skills** — drop-in `SKILL.md` files installed into Claude Code, Cursor, and other agents so they can use Olostep natively. Three categories:

| Category | What it does | Skills |
| --- | --- | --- |
| `usage` | Use Olostep's features | `scrape`, `search`, `answers`, `crawl`, `map`, `batch` |
| `build` | Install / integrate Olostep into a codebase | `setup`, `integrate` |
| `workflow` | Produce a deliverable end-to-end | `research`, `docs-to-code`, `migrate-code`, `debug-error`, `extract-schema` |

```bash
olostep add skills                              # install all 13 into every detected agent
olostep add skills --category usage             # only feature skills
olostep add skills --skill scrape --skill map   # cherry-pick
olostep add skills --agent cursor --agent claude
olostep list skills                             # show what's installed where
olostep remove skills                           # uninstall
```

Other useful flags: `--exclude <name>` (repeatable), `--global` / `--no-global`, `--link-mode <auto|symlink|copy>`, `--overwrite` / `--no-overwrite`, `--json`.

Supported agents: **Cursor, Claude, Codex, Windsurf, Continue, Augment, Roo, Gemini, Copilot, Factory.**

---

## MCP server install

The CLI writes the Olostep MCP server into your agent's config for you — no JSON editing.

```bash
olostep mcp install                       # detect agents, hosted endpoint (default)
olostep mcp install --agent cursor        # one agent
olostep mcp install --transport stdio     # local `npx olostep-mcp` instead
olostep mcp install --no-global           # write into the current project
olostep mcp install --dry-run --json      # show the plan, don't write
olostep list mcp                          # see where it's installed
olostep mcp uninstall                     # remove the olostep entry
```

**Two transports:**

- **`http`** *(default)* — hosted at `https://mcp.olostep.com/mcp`. No local process.
- **`stdio`** — runs `npx -y olostep-mcp` locally. Useful for offline use.

The CLI merges the `olostep` entry into your existing MCP config without touching other servers. Restart your agent after install.

Supported MCP-enabled agents: **Cursor, Claude Code, Windsurf, VS Code, Kilo.**

---

## Auth & config

API key resolution order (first match wins):

1. `--api-key <key>` flag
2. `OLOSTEP_API_KEY` env var
3. `OLOSTEP_API_TOKEN` env var
4. `.env` file in the current directory
5. Saved credentials file (after `olostep login`)

The credentials file is shared with the Python CLI, so existing users keep their login:

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/olostep-cli/credentials.json` |
| Linux | `~/.config/olostep-cli/credentials.json` |
| Windows | `%USERPROFILE%\AppData\Roaming\olostep-cli\credentials.json` |

Run `olostep logout` to delete that file (it confirms first — pass `-y` to skip, or `--dry-run` to preview). If `OLOSTEP_API_KEY` / `OLOSTEP_API_TOKEN` env vars or a `.env` file in your cwd still define a key, `logout` reports them with the exact unset commands — those sources take priority over the credentials file. Set `OLOSTEP_CLI_CONFIG_DIR` to override the directory. An "update available" notice prints on interactive runs — silence with `OLOSTEP_NO_UPDATE_NOTICE=1`.

---

## Tips

**PowerShell** tokenizes `,` and `*` differently from bash — quote the argument:

```powershell
olostep scrape "https://example.com" --formats "markdown,html"
olostep map   "https://example.com" --include-url "/*"
olostep answer "Extract facts" --json-format '{"company":"","year":""}'
```

Use single quotes for JSON to avoid `$` interpolation.

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
