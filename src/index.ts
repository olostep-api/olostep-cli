import { Command } from "commander";

import { registerLogin } from "./commands/login.js";
import { registerStatus } from "./commands/status.js";
import { registerUpdate } from "./commands/update.js";
import { registerInit } from "./commands/init.js";

import { registerScrape } from "./commands/scrape.js";
import { registerScrapeGet } from "./commands/scrape-get.js";
import { registerMap } from "./commands/map.js";
import { registerAnswer } from "./commands/answer.js";
import { registerCrawl } from "./commands/crawl.js";
import { registerBatchScrape } from "./commands/batch-scrape.js";
import { registerBatchUpdate } from "./commands/batch-update.js";

import { registerAddSkills } from "./commands/add-skills.js";
import { registerRemoveSkills } from "./commands/remove-skills.js";
import { registerListSkills } from "./commands/list-skills.js";
import { registerMcpInstall } from "./commands/mcp-install.js";
import { registerMcpUninstall } from "./commands/mcp-uninstall.js";
import { registerListMcp } from "./commands/list-mcp.js";

import { maybeNotifyUpdate } from "./lib/version-check.js";

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
  registerInit(program);
  registerStatus(program, VERSION);
  registerUpdate(program, VERSION);
  registerScrape(program);
  registerScrapeGet(program);
  registerMap(program);
  registerAnswer(program);
  registerCrawl(program);
  registerBatchScrape(program);
  registerBatchUpdate(program);

  // Parent commands for subcommands. Each parent is a Command that holds
  // children — `olostep add skills`, `olostep mcp install`, `olostep list skills`.
  const addCmd = program.command("add").description("Add resources to local agent environments.");
  const removeCmd = program.command("remove").description("Remove resources from local agent environments.");
  const mcpCmd = program.command("mcp").description("Install or uninstall the Olostep MCP server in your agents.");
  const listCmd = program.command("list").description("Show what Olostep has installed.");

  registerAddSkills(addCmd);
  registerRemoveSkills(removeCmd);
  registerListSkills(listCmd);
  registerMcpInstall(mcpCmd);
  registerMcpUninstall(mcpCmd);
  registerListMcp(listCmd);

  // Best-effort update notice — runs in parallel with the command,
  // never blocks command output, never throws.
  const notifyPromise = maybeNotifyUpdate(VERSION, process.argv[2]);

  await program.parseAsync(process.argv);

  // Brief window for the update notice to land before exit. It's
  // background work; we don't wait forever.
  await Promise.race([notifyPromise, new Promise((r) => setTimeout(r, 500))]);
}

main().catch((err: any) => {
  process.stderr.write(`Error: ${err?.message || err}\n`);
  process.exit(1);
});
