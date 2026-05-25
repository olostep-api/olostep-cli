import { Command } from "commander";

import { c, sym } from "../lib/colors.js";
import { resolveTargets, uninstallForAgents, type UninstallResult } from "../lib/mcp.js";

/**
 * Register `olostep mcp uninstall` on the given `mcp` parent command.
 *
 * Mirrors the Python CLI: removes only the `olostep` entry under each
 * agent's MCP server map and leaves every other key untouched.
 */
export function registerMcpUninstall(mcpApp: Command): void {
  mcpApp
    .command("uninstall")
    .description("Remove the Olostep MCP server entry from your agent configs.")
    .option(
      "--agent <name>",
      "Uninstall from this agent only (repeatable).",
      (val: string, prev: string[] = []) => [...prev, val],
      [] as string[],
    )
    .option("--all-agents", "Uninstall from every detected agent on this machine.", true)
    .option("--no-all-agents", "Do not auto-detect agents; require --agent.")
    .option("--global", "Target the per-user MCP config (default).", true)
    .option("--no-global", "Target a project-local MCP config in the current directory.")
    .option("--dry-run", "Show what would be removed without touching any file.", false)
    .option("--json", "Machine-readable JSON output.", false)
    .action((opts) => {
      const asJson = Boolean(opts.json);
      const dryRun = Boolean(opts.dryRun);
      const globalInstall = opts.global !== false;
      const allAgents = opts.allAgents !== false;
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
        const msg = "No agents detected. Use --agent to pick one.";
        if (asJson) {
          process.stdout.write(JSON.stringify({ removed: [], message: msg }, null, 2) + "\n");
          return;
        }
        process.stderr.write(`  ${c.yellow("i")}  ${msg}\n`);
        return;
      }

      let results: UninstallResult[];
      try {
        results = uninstallForAgents({ agents: targets, globalInstall, dryRun });
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
        return;
      }

      if (asJson) {
        const payload = results.map((r) => ({
          agent: r.agent,
          config_path: r.path,
          action: r.status,
        }));
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        return;
      }

      process.stderr.write("\n");
      const header = dryRun ? "DRY RUN — no files written" : "Olostep MCP uninstall";
      process.stderr.write(`  ${c.blue(c.bold(header))}\n`);
      for (const r of results) {
        const marker =
          r.status === "removed"
            ? c.green(sym.ok)
            : r.status === "would-remove"
              ? "·"
              : "—";
        process.stderr.write(`  ${marker}  ${r.agent.padEnd(10)}  [${r.status}]  ${r.path}\n`);
      }
      process.stderr.write("\n");
    });
}
