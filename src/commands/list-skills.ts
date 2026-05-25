import { Command } from "commander";

import { c, sym } from "../lib/colors.js";
import { failWith } from "../lib/output.js";
import {
  DEFAULT_SKILL_CATEGORY,
  listInstalledSkills,
} from "../lib/skills.js";

interface ListSkillsCliOptions {
  json?: boolean;
}

const CATEGORY_LABELS: Array<[string, string]> = [
  ["usage", "Usage"],
  ["build", "Build"],
  ["workflow", "Workflow"],
];

export function registerListSkills(listApp: Command): void {
  listApp
    .command("skills")
    .description("Show which Olostep skills are installed and into which agents.")
    .option("--json", "Machine-readable JSON output.")
    .action(async (opts: ListSkillsCliOptions) => {
      try {
        const info = listInstalledSkills();

        if (opts.json) {
          process.stdout.write(JSON.stringify(info, null, 2) + "\n");
          return;
        }

        const stderr = process.stderr;
        stderr.write("\n");
        if (!info.skills.length) {
          stderr.write("  " + c.yellow(c.bold("No Olostep skills installed.")) + "\n");
          stderr.write("  " + c.dim("Run `olostep add skills` to install them.") + "\n");
          stderr.write("\n");
          return;
        }

        stderr.write(
          "  " + c.green(c.bold(`Olostep skills installed (${info.skills.length})`)) + "\n",
        );
        stderr.write("\n");

        const known = new Set(CATEGORY_LABELS.map(([k]) => k));
        for (const [cat, label] of CATEGORY_LABELS) {
          const inCat = info.skills.filter(
            (s) => (s.category || DEFAULT_SKILL_CATEGORY) === cat,
          );
          if (!inCat.length) continue;
          stderr.write("  " + c.dim(label) + "\n");
          for (const s of inCat) {
            const mark = s.canonicalExists ? sym.ok : sym.fail;
            const when = (s.updatedAt || s.installedAt || "").split("T")[0];
            let line = `    ${mark} ${s.name}`;
            if (when) line += `   updated ${when}`;
            stderr.write((s.canonicalExists ? line : c.red(line)) + "\n");
          }
        }
        // Anything with an unexpected category.
        const others = info.skills.filter(
          (s) => !known.has(s.category || DEFAULT_SKILL_CATEGORY),
        );
        for (const s of others) {
          const mark = s.canonicalExists ? sym.ok : sym.fail;
          const line = `    ${mark} ${s.name}`;
          stderr.write((s.canonicalExists ? line : c.red(line)) + "\n");
        }
        stderr.write("\n");

        const agents = Object.keys(info.agents).sort();
        if (agents.length) {
          stderr.write("  " + c.dim("Installed into AI agents:") + "\n");
          for (const agent of agents) {
            const folders = info.agents[agent];
            stderr.write(
              "  " +
                c.dim(`  ${agent.padEnd(10)} ${folders.length} skills`) +
                "\n",
            );
          }
        } else {
          stderr.write("  " + c.dim("Not linked into any AI agent yet.") + "\n");
        }
        stderr.write("\n");
        stderr.write("  " + c.dim(`Skills store: ${info.canonicalDir}`) + "\n");
        stderr.write("\n");
      } catch (err) {
        failWith(err);
      }
    });
}
