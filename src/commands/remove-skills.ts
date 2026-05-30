import { Command } from "commander";

import { c, sym } from "../lib/colors.js";
import { failWith, isJsonMode } from "../lib/output.js";
import { AGENT_KEYS, runRemove } from "../lib/skills.js";

interface RemoveSkillsCliOptions {
  canonicalDir?: string;
  agent?: string[];
  allAgents?: boolean;
  agentSkillsDir?: string;
  skill?: string[];
  dryRun?: boolean;
  json?: boolean;
}

function collect(value: string, prev: string[] = []): string[] {
  return [...prev, value];
}

export async function removeSkillsAction(opts: RemoveSkillsCliOptions): Promise<void> {
  try {
    if (opts.agent && opts.agent.length) {
      const unknown = opts.agent.filter((a) => !AGENT_KEYS.includes(a));
      if (unknown.length) {
        throw new Error(
          `Unknown agent(s): ${[...unknown].sort().join(", ")}. ` +
            `Known: ${AGENT_KEYS.join(", ")}`,
        );
      }
    }

    const result = runRemove({
      canonicalDir: opts.canonicalDir,
      agents: opts.agent ?? [],
      allAgents: opts.allAgents ?? true,
      agentSkillsDir: opts.agentSkillsDir,
      only: opts.skill ?? [],
      dryRun: !!opts.dryRun,
    });

    if (isJsonMode(opts)) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }

    const stderr = process.stderr;
    stderr.write("\n");
    stderr.write(
      "  " +
        c.green(c.bold(`${sym.ok}  Skills removal ${result.dryRun ? "preview" : "finished"}.`)) +
        "\n",
    );
    const canonList = result.removedCanonical.length
      ? result.removedCanonical.join(", ")
      : "none";
    stderr.write("  " + c.dim(`Canonical removed: ${canonList}`) + "\n");
    stderr.write(
      "  " + c.dim(`Target entries removed: ${result.removedAgentEntries.length}`) + "\n",
    );
    stderr.write("\n");
  } catch (err) {
    failWith(err);
  }
}

export function registerRemoveSkills(removeApp: Command): void {
  removeApp
    .command("skills")
    .description("Remove installed Olostep skills from canonical and agent directories.")
    .option("--canonical-dir <path>", "Canonical skills directory.")
    .option("--agent <name>", "Remove from this agent only (repeatable).", collect, [])
    .option("--all-agents", "Remove from all detected agents.", true)
    .option("--no-all-agents", "Do not target all detected agents.")
    .option("--agent-skills-dir <path>", "Override target skills directory.")
    .option("--skill <name>", "Only remove these skill names (repeatable).", collect, [])
    .option("--dry-run", "Show what would be removed without touching files.")
    .option("--json", "Print machine-readable JSON output.")
    .action(removeSkillsAction);
}
