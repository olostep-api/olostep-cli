import { Command } from "commander";
import { spawn } from "node:child_process";

import { checkForUpdate } from "../lib/version-check.js";
import { c, sym } from "../lib/colors.js";

function runNpmInstallGlobal(): Promise<number> {
  return new Promise((resolve) => {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmCmd, ["install", "-g", "olostep-cli@latest"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export function registerUpdate(program: Command, version: string): void {
  program
    .command("update")
    .description("Update the CLI to the latest version (npm install -g olostep-cli@latest).")
    .option("--check", "Only check whether a newer version is available")
    .action(async (opts) => {
      const latest = await checkForUpdate(version);

      if (opts.check) {
        if (latest) {
          process.stdout.write(`Update available: ${version} ${sym.arrow} ${latest}\n`);
          process.exit(0);
        }
        process.stdout.write(`Up to date (olostep ${version}).\n`);
        return;
      }

      if (!latest) {
        process.stdout.write(`Already on the latest version (olostep ${version}).\n`);
        return;
      }

      process.stderr.write(
        `Updating ${c.dim(version)} ${sym.arrow} ${c.bold(latest)}${sym.dots}\n`,
      );
      const code = await runNpmInstallGlobal();
      if (code === 0) {
        process.stderr.write(`${c.green(sym.ok)} Updated to olostep ${latest}.\n`);
      } else {
        process.stderr.write(
          `${c.yellow(sym.fail)} npm install failed (exit ${code}). Try: ` +
            `sudo npm install -g olostep-cli@latest, or use a Node version ` +
            `manager (nvm) to avoid global permission issues.\n`,
        );
        process.exit(code || 1);
      }
    });
}
