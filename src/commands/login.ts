import { Command } from "commander";

import { runLogin } from "../lib/auth.js";

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Sign in via browser and save the API key to credentials.json.")
    .option("--no-browser", "Print the authorize URL instead of opening a browser")
    .option("--poll-seconds <n>", "Interval between status polls", "3")
    .option("--timeout <n>", "Give up after this many seconds", "600")
    .action(async (opts) => {
      try {
        await runLogin({
          noBrowser: !opts.browser, // commander inverts --no-* to opts.browser=false
          pollSeconds: Number(opts.pollSeconds),
          timeoutSeconds: Number(opts.timeout),
        });
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
      }
    });
}
