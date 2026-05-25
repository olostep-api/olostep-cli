# olostep-cli

CLI for the [Olostep API](https://www.olostep.com/) — scrape, map, crawl, answer, and batch the web from your terminal. Every command returns **JSON** for scripts, CI, and AI agents.

Pure JavaScript. No Python, no binary download, fast install and fast startup.

> **0.2.x is the new Node rewrite of the CLI.** Same commands, same flags, same credentials path as 0.1.x. Existing users get a smaller install and a faster CLI when they update.

---

## Install

```bash
npm install -g olostep-cli
olostep init
```

`olostep init` is the recommended first step — it signs you in, installs the Olostep skills into your AI agents, and configures the MCP server, all in one command.

**Requirements:** Node.js **18+**.

---

## Sign in

```bash
olostep login              # browser PKCE flow
olostep login --no-browser # print the URL instead
```

Credentials are saved at the same place as the Python CLI:

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/olostep-cli/credentials.json` |
| Linux | `~/.config/olostep-cli/credentials.json` |
| Windows | `%USERPROFILE%\AppData\Roaming\olostep-cli\credentials.json` |

You can also use `OLOSTEP_API_KEY` (or `OLOSTEP_API_TOKEN`), or a project-local `.env`.

---

## Status & updates

```bash
olostep status            # version, auth state, config dir
olostep status --json     # machine-readable
olostep update            # update to the latest version
olostep update --check    # check only
```

A one-line "update available" notice prints on interactive runs (silenceable with `OLOSTEP_NO_UPDATE_NOTICE=1`). It never blocks command output.

---

## Coming next

`scrape`, `map`, `answer`, `crawl`, `scrape-get`, `batch-scrape`, `batch-update`, `add/remove/list skills`, `mcp install/uninstall`, `list mcp`. Same flags and JSON schemas as the previous CLI.

---

## License

MIT
