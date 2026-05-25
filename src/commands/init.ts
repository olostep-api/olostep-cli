import { Command } from "commander";

import { runLogin } from "../lib/auth.js";
import { resolveApiKey, isAuthenticated } from "../lib/config.js";
import { runInstall as runSkillsInstall, type InstallOptions as SkillsInstallOptions } from "../lib/skills.js";
import { installForAgents as runMcpInstall, resolveTargets as resolveMcpTargets } from "../lib/mcp.js";
import { c, sym } from "../lib/colors.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Set up Olostep in one step: sign in, install skills, install the MCP server.")
    .option("--no-browser", "Print the authorize URL instead of opening a browser")
    .option("--skills-only", "Only install skills (skip the MCP server)")
    .option("--mcp-only", "Only install the MCP server (skip skills)")
    .option("--relogin", "Sign in again even if already authenticated")
    .action(async (opts) => {
      if (opts.skillsOnly && opts.mcpOnly) {
        process.stderr.write("Error: use only one of --skills-only or --mcp-only.\n");
        process.exit(2);
      }

      process.stderr.write(`\n  ${c.bold("Setting up Olostep…")}\n\n`);

      // 1. Authenticate — only if MCP install needs it. Skills install
      //    works without an API key, so --skills-only doesn't force a login.
      const needsAuth = !opts.skillsOnly;
      if (needsAuth) {
        if (opts.relogin || !isAuthenticated()) {
          try {
            await runLogin({ noBrowser: !opts.browser });
          } catch (err: any) {
            process.stderr.write(
              `  ${c.yellow(sym.fail)} Sign-in failed: ${err?.message || err}\n` +
                `     Skills can still be installed locally; MCP install will be skipped.\n`,
            );
            // Fall through — install what we can, mirroring graceful degradation.
            opts.mcpOnly = false;
            opts.skillsOnly = true;
          }
        } else {
          process.stderr.write(`  ${c.green(sym.ok)} Already signed in\n`);
        }
      }

      // 2. Skills
      if (!opts.mcpOnly) {
        try {
          const skillsOpts: SkillsInstallOptions = {
            allAgents: true,
            globalInstall: true,
            overwrite: true,
            linkMode: "auto",
          };
          const result = runSkillsInstall(skillsOpts);
          const n = result.skills.length;
          const tgts = result.targets;
          if (tgts.length > 0) {
            process.stderr.write(
              `  ${c.green(sym.ok)} Installed ${n} skills across ${tgts.length} ` +
                `agent${tgts.length !== 1 ? "s" : ""}: ${tgts.join(", ")}\n`,
            );
          } else {
            process.stderr.write(
              `  ${c.green(sym.ok)} Installed ${n} skills (no AI agents detected yet — ` +
                `install Cursor/Claude Code/etc. and re-run \`olostep add skills\`)\n`,
            );
          }
        } catch (err: any) {
          process.stderr.write(`  ${c.yellow("—")} Skills install skipped: ${err?.message || err}\n`);
        }
      }

      // 3. MCP
      if (!opts.skillsOnly) {
        try {
          const apiKey = resolveApiKey();
          const targets = resolveMcpTargets({ agents: [], allAgents: true });
          if (targets.length === 0) {
            process.stderr.write(
              `  ${c.yellow("—")} MCP server: no agents detected — ` +
                `run \`olostep mcp install --agent <name>\` later\n`,
            );
          } else {
            runMcpInstall({
              agents: targets,
              apiKey,
              transport: "http",
              globalInstall: true,
              overwrite: true,
              dryRun: false,
            });
            process.stderr.write(
              `  ${c.green(sym.ok)} Olostep MCP server installed in ${targets.length} ` +
                `agent${targets.length !== 1 ? "s" : ""}: ${targets.join(", ")}\n`,
            );
          }
        } catch (err: any) {
          process.stderr.write(`  ${c.yellow("—")} MCP install skipped: ${err?.message || err}\n`);
        }
      }

      process.stderr.write(
        `\n  ${c.dim("You're ready. Restart your AI agent, then try:")}\n` +
          `    olostep scrape https://example.com\n` +
          `    olostep answer "what is olostep"\n\n` +
          `  ${c.dim("olostep status   # see what's set up")}\n` +
          `  ${c.dim("olostep --help   # all commands")}\n\n`,
      );
    });
}
