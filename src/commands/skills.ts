import { Command } from "commander";

import { addSkillsAction } from "./add-skills.js";
import { listSkillsAction } from "./list-skills.js";
import { removeSkillsAction } from "./remove-skills.js";

function collect(value: string, prev: string[] = []): string[] {
  return [...prev, value];
}

/**
 * Register `olostep skills` parent command with install/list/uninstall/update
 * subcommands. These are aliases for the existing `add skills`, `list skills`,
 * and `remove skills` commands, delegating to the same handler functions.
 */
export function registerSkills(program: Command): void {
  const skillsCmd = program
    .command("skills")
    .description("Manage Olostep skills (aliases for add/list/remove skills).");

  // skills install = add skills
  skillsCmd
    .command("install")
    .description("Install Olostep skills into agent skill directories.")
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
    .action(addSkillsAction);

  // skills list = list skills
  skillsCmd
    .command("list")
    .description("Show which Olostep skills are installed and into which agents.")
    .option("--json", "Machine-readable JSON output.")
    .action(listSkillsAction);

  // skills uninstall = remove skills
  skillsCmd
    .command("uninstall")
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

  // skills update = add skills with --overwrite (overwrite defaults to true, so same as install)
  skillsCmd
    .command("update")
    .description("Update (re-install with overwrite) Olostep skills.")
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
    .option("--link-mode <mode>", "Agent install mode: auto, symlink, copy.", "auto")
    .option("--json", "Print machine-readable JSON output.")
    .action((opts) => addSkillsAction({ ...opts, overwrite: true }));
}
