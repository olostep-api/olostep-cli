import { Command } from "commander";

import { c, sym } from "../lib/colors.js";
import { failWith } from "../lib/output.js";
import {
  AGENT_KEYS,
  InstallResult,
  SKILL_CATEGORIES,
  runInstall,
} from "../lib/skills.js";

interface AddSkillsCliOptions {
  login?: boolean;
  source?: string;
  canonicalDir?: string;
  agent?: string[];
  allAgents?: boolean;
  global?: boolean;
  agentSkillsDir?: string;
  skill?: string[];
  exclude?: string[];
  category?: string;
  overwrite?: boolean;
  linkMode?: string;
  json?: boolean;
}

function collect(value: string, prev: string[] = []): string[] {
  return [...prev, value];
}

const CATEGORY_LABELS: Array<[string, string]> = [
  ["usage", "Use Olostep features"],
  ["build", "Build with Olostep"],
  ["workflow", "Run Olostep workflows"],
];

function groupByCategory(
  installed: InstallResult["installed"],
): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const [cat, label] of CATEGORY_LABELS) {
    const members = installed
      .filter((s) => s.category === cat)
      .map((s) => s.sanitizedName);
    if (members.length) out.push([label, members]);
  }
  return out;
}

export function registerAddSkills(addApp: Command): void {
  addApp
    .command("skills")
    .description("Add Olostep skills from local plugin into agent skill directories.")
    .option("--login", "Run `olostep login` flow before installing skills.")
    .option("--source <path>", "Skills source directory (default: CLI bundled skills).")
    .option("--canonical-dir <path>", "Canonical skills directory.")
    .option("--agent <name>", "Install for this agent only (repeatable).", collect, [])
    .option("--all-agents", "Install for all detected agents.", true)
    .option("--no-all-agents", "Do not auto-install for all detected agents.")
    .option("--global", "Install into global agent skills directories.", true)
    .option("--no-global", "Do not install into global agent skills directories.")
    .option("--agent-skills-dir <path>", "Override target skills directory (non-global mode).")
    .option("--skill <name>", "Only install these skill names (repeatable).", collect, [])
    .option("--exclude <name>", "Exclude these skill names (repeatable).", collect, [])
    .option("--category <name>", "Install only one category: usage, build, or workflow.")
    .option("--overwrite", "Replace existing installed skills.", true)
    .option("--no-overwrite", "Do not replace existing installed skills.")
    .option("--link-mode <mode>", "Agent install mode: auto, symlink, copy.", "auto")
    .option("--json", "Print machine-readable JSON output.")
    .action(async (opts: AddSkillsCliOptions) => {
      try {
        const linkMode = (opts.linkMode || "auto").toLowerCase();
        if (!["auto", "symlink", "copy"].includes(linkMode)) {
          throw new Error("--link-mode must be one of: auto, symlink, copy");
        }
        if (opts.category && !(SKILL_CATEGORIES as readonly string[]).includes(opts.category)) {
          throw new Error("--category must be 'usage', 'build', or 'workflow'");
        }
        if (opts.agent && opts.agent.length) {
          const unknown = opts.agent.filter((a) => !AGENT_KEYS.includes(a));
          if (unknown.length) {
            throw new Error(
              `Unknown agent(s): ${[...unknown].sort().join(", ")}. ` +
                `Known: ${AGENT_KEYS.join(", ")}`,
            );
          }
        }
        const globalInstall = opts.global ?? true;
        if (opts.agentSkillsDir && globalInstall) {
          throw new Error("--agent-skills-dir requires --no-global");
        }
        if (!globalInstall && !opts.agentSkillsDir) {
          throw new Error("Use --agent-skills-dir when running with --no-global");
        }

        if (opts.login) {
          // Best-effort, optional login. Imported lazily so this command file
          // stays decoupled if the login surface changes.
          try {
            const mod: any = await import("./login.js");
            const fn = mod.runLogin || mod.default;
            if (typeof fn === "function") await fn({});
          } catch {
            // Silently skip — login wiring is owned by index.ts.
          }
        }

        const result = runInstall({
          source: opts.source,
          canonicalDir: opts.canonicalDir,
          agents: opts.agent ?? [],
          allAgents: opts.allAgents ?? true,
          globalInstall,
          agentSkillsDir: opts.agentSkillsDir,
          only: opts.skill ?? [],
          exclude: opts.exclude ?? [],
          category: opts.category,
          overwrite: opts.overwrite ?? true,
          linkMode: linkMode as "auto" | "symlink" | "copy",
          dryRun: false,
        });

        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          return;
        }

        const stderr = process.stderr;
        const skillCount = result.installed.length;
        const targets = result.targets;
        stderr.write("\n");
        stderr.write("  " + c.bold("Installing Olostep skills for your AI coding agents…") + "\n");
        stderr.write("\n");
        for (const [label, members] of groupByCategory(result.installed)) {
          stderr.write(`  ${c.green(sym.ok)} ${label} (${members.length})\n`);
          stderr.write(`      ${c.dim(members.join(", "))}\n`);
        }
        stderr.write("\n");
        if (targets.length) {
          const word = targets.length === 1 ? "agent" : "agents";
          stderr.write(
            "  " +
              c.green(c.bold(
                `${sym.ok} Installed ${skillCount} skills across ${targets.length} AI ${word}: ${targets.join(", ")}`,
              )) +
              "\n",
          );
        } else {
          stderr.write(
            "  " +
              c.green(c.bold(`${sym.ok} Installed ${skillCount} skills into the Olostep skills store`)) +
              "\n",
          );
          stderr.write(
            "    " +
              c.dim("(no AI agents detected — install one, then re-run, or use --agent)") +
              "\n",
          );
        }
        stderr.write("\n");
        stderr.write("  " + c.dim("Use Olostep from your terminal or your AI agent:") + "\n");
        stderr.write(`    ${sym.arrow} Scrape   olostep scrape https://stripe.com/pricing\n`);
        stderr.write(`    ${sym.arrow} Search   olostep answer "latest news in AI"\n`);
        stderr.write(`    ${sym.arrow} Crawl    olostep crawl https://docs.example.com\n`);
        stderr.write("\n");
        stderr.write("    " + c.dim(`${sym.arrow} Install the MCP server:  olostep mcp install`) + "\n");
        stderr.write("    " + c.dim(`${sym.arrow} See what's installed:    olostep list skills`) + "\n");
        stderr.write("    " + c.dim(`${sym.arrow} All commands:            olostep --help`) + "\n");
        stderr.write("\n");
      } catch (err) {
        failWith(err);
      }
    });
}
