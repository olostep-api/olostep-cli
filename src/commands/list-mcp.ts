import { Command } from "commander";

import { c, sym } from "../lib/colors.js";
import { listInstalled } from "../lib/mcp.js";

/**
 * Register `olostep list mcp` on the given `list` parent command.
 *
 * Pure read — never mutates any agent config. Mirrors the Python CLI's
 * `olostep list mcp`.
 */
export function registerListMcp(listApp: Command): void {
  listApp
    .command("mcp")
    .description("Show which agents have the Olostep MCP server installed.")
    .option("--global", "Check per-user configs (default).", true)
    .option("--no-global", "Check project-local configs in the current directory.")
    .option("--json", "Machine-readable JSON output.", false)
    .action((opts) => {
      const globalInstall = opts.global !== false;
      const asJson = Boolean(opts.json);
      const statuses = listInstalled({ globalInstall });

      if (asJson) {
        const payload = statuses.map((s) => {
          const row: Record<string, unknown> = {
            agent: s.agent,
            config_path: s.path,
            installed: s.present,
            transport: s.transport ?? null,
          };
          if (s.entry) row.entry = s.entry;
          if (s.error) row.error = s.error;
          return row;
        });
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        return;
      }

      const installed = statuses.filter((s) => s.present);
      process.stderr.write("\n");
      if (installed.length > 0) {
        const plural = installed.length === 1 ? "" : "s";
        process.stderr.write(
          `  ${c.green(c.bold(`Olostep MCP server installed in ${installed.length} agent${plural}`))}\n`,
        );
      } else {
        process.stderr.write(
          `  ${c.yellow(c.bold("Olostep MCP server is not installed in any agent."))}\n`,
        );
      }
      process.stderr.write("\n");
      for (const s of statuses) {
        if (s.error) {
          process.stderr.write(`  ${c.red(`! ${s.agent.padEnd(10)} config unreadable: ${s.error}`)}\n`);
        } else if (s.present) {
          const t = s.transport || "unknown";
          process.stderr.write(`  ${c.green(`${sym.ok} ${s.agent.padEnd(10)} [${t}]  ${s.path}`)}\n`);
        } else {
          process.stderr.write(`  ${c.dim(`— ${s.agent.padEnd(10)} not installed`)}\n`);
        }
      }
      process.stderr.write("\n");
      if (installed.length === 0) {
        process.stderr.write(`  ${c.dim("Run `olostep mcp install` to set it up.")}\n\n`);
      }
    });
}
