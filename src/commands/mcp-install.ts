import { Command } from "commander";

import { c, sym } from "../lib/colors.js";
import { resolveApiKey } from "../lib/config.js";
import {
  installForAgents,
  redact,
  resolveTargets,
  type InstallResult,
  type Transport,
} from "../lib/mcp.js";

/**
 * Register `olostep mcp install` on the given `mcp` parent command.
 *
 * Stdout is reserved for `--json` payloads. Human-readable output and
 * progress go to stderr so they can be piped/grepped without contaminating
 * JSON consumers.
 */
export function registerMcpInstall(mcpApp: Command): void {
  mcpApp
    .command("install")
    .description("Install the Olostep MCP server in your AI agent's config.")
    .option(
      "--agent <name>",
      "Install for this agent only (repeatable). Supported: cursor, claude, windsurf, vscode, kilo.",
      (val: string, prev: string[] = []) => [...prev, val],
      [] as string[],
    )
    .option("--all-agents", "Install for every detected agent on this machine.", true)
    .option("--no-all-agents", "Do not auto-detect agents; require --agent.")
    .option(
      "--transport <mode>",
      "MCP transport: 'http' (hosted endpoint) or 'stdio' (local npx).",
      "http",
    )
    .option("--global", "Write the per-user MCP config (default).", true)
    .option("--no-global", "Write a project-local config in the current directory.")
    .option(
      "--api-key <key>",
      "API key to embed in the MCP config. Defaults to OLOSTEP_API_KEY / saved credentials.",
    )
    .option("--overwrite", "Replace an existing 'olostep' entry if present.", true)
    .option("--no-overwrite", "Leave an existing 'olostep' entry alone.")
    .option("--dry-run", "Show what would be written without touching any file.", false)
    .option("--json", "Machine-readable JSON output.", false)
    .option("--no-redact", "Do not mask the API key in --dry-run --json output.")
    .action(async (opts) => {
      const transport = String(opts.transport) as Transport;
      if (transport !== "http" && transport !== "stdio") {
        process.stderr.write(
          `Error: --transport must be 'http' or 'stdio' (got '${transport}')\n`,
        );
        process.exit(2);
      }

      const asJson = Boolean(opts.json);
      const dryRun = Boolean(opts.dryRun);
      const globalInstall = opts.global !== false;
      const overwrite = opts.overwrite !== false;
      const allAgents = opts.allAgents !== false;
      const doRedact = opts.redact !== false;
      const agents: string[] = Array.isArray(opts.agent) ? opts.agent : [];

      let targets: string[];
      try {
        targets = resolveTargets({ agents, allAgents });
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(2);
        return;
      }

      if (targets.length === 0) {
        const msg =
          "No agents detected. Use --agent to pick one, or run `olostep mcp install --agent cursor`.";
        if (asJson) {
          process.stdout.write(JSON.stringify({ installed: [], message: msg }, null, 2) + "\n");
          return;
        }
        process.stderr.write(`  ${c.yellow("i")}  ${msg}\n`);
        return;
      }

      let apiKey = (opts.apiKey || "").toString().trim();
      if (!apiKey) {
        try {
          apiKey = resolveApiKey();
        } catch {
          process.stderr.write(
            "Error: No API key found. Pass --api-key, set OLOSTEP_API_KEY, or run `olostep login`.\n",
          );
          process.exit(2);
          return;
        }
      }

      let results: InstallResult[];
      try {
        results = installForAgents({
          agents: targets,
          apiKey,
          transport,
          globalInstall,
          overwrite,
          dryRun,
        });
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
        return;
      }

      if (asJson) {
        const payload = results.map((r) => ({
          agent: r.agent,
          config_path: r.path,
          transport: r.transport,
          action: r.status,
          // `installForAgents` already redacts the returned entry. If the
          // caller passed --no-redact, rebuild from the raw entry by
          // un-redacting is not possible (we never kept it). The original
          // contract: --no-redact means "don't redact in --dry-run --json
          // output". Easiest path: when --no-redact, embed the live key.
          entry: doRedact ? r.entry : unredact(r.entry, apiKey),
        }));
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        return;
      }

      const endpoint = transport === "http" ? "hosted endpoint" : "local stdio";
      process.stderr.write("\n");
      if (dryRun) {
        process.stderr.write(
          `  ${c.yellow(c.bold(`DRY RUN — would install the Olostep MCP server (${endpoint}) — no files written`))}\n`,
        );
      } else {
        process.stderr.write(
          `  ${c.bold(`Installing the Olostep MCP server (${endpoint}) into your AI agents…`)}\n`,
        );
      }
      process.stderr.write("\n");
      for (const r of results) {
        const marker =
          r.status === "installed" || r.status === "updated"
            ? c.green(sym.ok)
            : r.status === "would-install" || r.status === "would-update"
              ? "·"
              : r.status === "skipped"
                ? "—"
                : "?";
        process.stderr.write(`  ${marker} ${r.agent.padEnd(10)} ${r.path}\n`);
      }
      process.stderr.write("\n");
      const done = results.filter((r) => r.status === "installed" || r.status === "updated");
      if (!dryRun && done.length > 0) {
        const plural = done.length === 1 ? "" : "s";
        process.stderr.write(
          `  ${c.green(c.bold(`${sym.ok} Olostep MCP server installed in ${done.length} agent${plural} (transport: ${transport})`))}\n\n`,
        );
        process.stderr.write(`  ${c.dim("Restart your agent, then ask it to:")}\n`);
        process.stderr.write(`    ${sym.arrow} "Scrape the pricing page of stripe.com"\n`);
        process.stderr.write(`    ${sym.arrow} "Search for the latest news in AI"\n\n`);
        process.stderr.write(`    ${c.dim(`${sym.arrow} See where it's installed:  olostep list mcp`)}\n`);
        process.stderr.write(`    ${c.dim(`${sym.arrow} All commands:              olostep --help`)}\n\n`);
      }
    });
}

/**
 * Restore the real API key into a redacted entry. Only used when the user
 * explicitly passes --no-redact (e.g. piping into a config script).
 */
function unredact(entry: Record<string, unknown>, apiKey: string): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
  const headers = out.headers;
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    const h = headers as Record<string, unknown>;
    if (typeof h.Authorization === "string") h.Authorization = `Bearer ${apiKey}`;
  }
  const env = out.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const e = env as Record<string, unknown>;
    if (typeof e.OLOSTEP_API_KEY === "string") e.OLOSTEP_API_KEY = apiKey;
  }
  return out;
}

// Re-export to silence unused-import lint if redact ends up unused above.
export { redact };
