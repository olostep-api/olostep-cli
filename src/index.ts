import { Command } from "commander";

import { registerLogin } from "./commands/login.js";
import { registerLogout } from "./commands/logout.js";
import { registerStatus } from "./commands/status.js";
import { registerUpdate } from "./commands/update.js";
import { registerInit } from "./commands/init.js";
import { registerAuth } from "./commands/auth.js";
import { registerVersion } from "./commands/version.js";

import { registerScrape } from "./commands/scrape.js";
import { registerScrapeGet } from "./commands/scrape-get.js";
import { registerMap } from "./commands/map.js";
import { registerAnswer } from "./commands/answer.js";
import { registerCrawl } from "./commands/crawl.js";
import { registerBatchScrape } from "./commands/batch-scrape.js";
import { registerBatchUpdate } from "./commands/batch-update.js";
import { registerSearch } from "./commands/search.js";
import { registerMonitor } from "./commands/monitor.js";

import { registerAddSkills } from "./commands/add-skills.js";
import { registerRemoveSkills } from "./commands/remove-skills.js";
import { registerListSkills } from "./commands/list-skills.js";
import { registerSkills } from "./commands/skills.js";
import { registerMcpInstall } from "./commands/mcp-install.js";
import { registerMcpUninstall } from "./commands/mcp-uninstall.js";
import { registerListMcp } from "./commands/list-mcp.js";
import { registerDoctor } from "./commands/doctor.js";

import { showPendingUpdateNotice, scheduleUpdateCheck } from "./lib/version-check.js";

// Replaced at build time by tsup's `define` with the package.json version.
// The fallback only fires under `npm run dev` (tsx) where define doesn't apply.
declare const __OLOSTEP_CLI_VERSION__: string;
const VERSION: string =
  typeof __OLOSTEP_CLI_VERSION__ !== "undefined" ? __OLOSTEP_CLI_VERSION__ : "0.0.0-dev";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("olostep")
    .description(
      "CLI for the Olostep API — scrape, map, crawl, answer, batch the web, " +
        "plus skills and MCP install.",
    )
    .version(VERSION, "-V, --version", "Show version and exit")
    .helpOption("-h, --help", "Show help")
    .showHelpAfterError();

  // Top-level commands
  registerLogin(program);
  registerLogout(program);
  registerInit(program);
  registerStatus(program, VERSION);
  registerUpdate(program, VERSION);
  registerVersion(program, VERSION);
  registerScrape(program);
  registerScrapeGet(program);
  registerMap(program);
  registerAnswer(program);
  registerCrawl(program);
  registerBatchScrape(program);
  registerBatchUpdate(program);
  registerSearch(program);
  registerMonitor(program);

  // auth subcommand group
  registerAuth(program, VERSION);

  // Parent commands for subcommands. Each parent is a Command that holds
  // children — `olostep add skills`, `olostep mcp install`, `olostep list skills`.
  const addCmd = program.command("add").description("Add resources to local agent environments.");
  const removeCmd = program.command("remove").description("Remove resources from local agent environments.");
  const mcpCmd = program.command("mcp").description("Install or uninstall the Olostep MCP server in your agents.");
  const listCmd = program.command("list").description("Show what Olostep has installed.");

  registerDoctor(program);
  registerAddSkills(addCmd);
  registerRemoveSkills(removeCmd);
  registerListSkills(listCmd);
  registerSkills(program);
  registerMcpInstall(mcpCmd);
  registerMcpUninstall(mcpCmd);
  registerListMcp(listCmd);

  // Show any pending update notice from the previous check (appears before command output).
  showPendingUpdateNotice(VERSION, process.argv[2]);
  // Fire the registry check for the next run — no await, never blocks.
  scheduleUpdateCheck(VERSION, process.argv[2]);

  await program.parseAsync(process.argv);
}

main().catch((err: any) => {
  process.stderr.write(`Error: ${err?.message || err}\n`);
  process.exit(1);
});
