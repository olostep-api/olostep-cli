import { Command } from "commander";
import * as readline from "node:readline/promises";

import { runLogout, LogoutResult } from "../lib/logout.js";
import { getCredentialsPath } from "../lib/config.js";
import { c, sym } from "../lib/colors.js";
import { isJsonMode } from "../lib/output.js";

/**
 * Ask the user to confirm credential removal. Returns true to proceed.
 *
 * - In non-TTY (pipes, CI), there's no way to read input — auto-proceed.
 *   Callers gate this with --yes / --json so we never hit it in real scripts.
 * - The prompt goes to stderr so stdout stays clean for any caller that
 *   pipes us (even though we don't print JSON in interactive mode).
 */
async function confirmRemoval(path: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`Remove credentials file at ${path}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function renderHuman(result: LogoutResult): string {
  const lines: string[] = [""];

  if (result.dryRun) {
    if (result.credentialsExisted) {
      lines.push(`  ${c.yellow(sym.arrow)} Would remove credentials file`);
    } else {
      lines.push(`  ${c.dim(sym.ok)} No credentials file to remove`);
    }
  } else if (result.removedCredentials) {
    lines.push(`  ${c.green(sym.ok)} Removed credentials file`);
  } else {
    lines.push(`  ${c.dim(sym.ok)} No credentials file to remove`);
  }
  lines.push(`  ${c.dim(result.credentialsPath)}`);

  if (result.fullySignedOut) {
    lines.push("");
    lines.push(`  ${c.green(sym.ok)} ${result.dryRun ? "Would be fully signed out." : "Fully signed out."}`);
    lines.push("");
    return lines.join("\n") + "\n";
  }

  lines.push("");
  lines.push(`  ${c.yellow(sym.fail)} Still signed in via:`);
  for (const v of result.envVarsSet) lines.push(`    · ${c.bold(v)} env var`);
  for (const f of result.envFilesWithKey) lines.push(`    · ${c.bold(f)} (.env file)`);
  lines.push("");

  if (result.envVarsSet.length > 0) {
    lines.push(`  ${c.dim("To clear the env vars — PowerShell:")}`);
    for (const v of result.envVarsSet) {
      lines.push(`    ${c.dim(`Remove-Item Env:${v}`)}`);
      lines.push(`    ${c.dim(`[Environment]::SetEnvironmentVariable("${v}", $null, "User")`)}`);
    }
    lines.push("");
    lines.push(`  ${c.dim("bash / zsh:")}`);
    for (const v of result.envVarsSet) {
      lines.push(`    ${c.dim(`unset ${v}    # and remove it from ~/.bashrc, ~/.zshrc, etc.`)}`);
    }
    lines.push("");
  }

  if (result.envFilesWithKey.length > 0) {
    lines.push(`  ${c.dim("Then remove the OLOSTEP_API_KEY / OLOSTEP_API_TOKEN line from:")}`);
    for (const f of result.envFilesWithKey) lines.push(`    ${c.dim(f)}`);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

export function registerLogout(program: Command): void {
  program
    .command("logout")
    .description("Sign out by removing the saved credentials file.")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--dry-run", "Show what would happen, but don't remove anything")
    .option("--json", "Machine-readable JSON output (implies --yes)")
    .action(async (opts) => {
      try {
        const credentialsPath = getCredentialsPath();
        const jsonMode = isJsonMode(opts);
        const skipPrompt = opts.yes || jsonMode || opts.dryRun;

        if (!skipPrompt) {
          const proceed = await confirmRemoval(credentialsPath);
          if (!proceed) {
            process.stderr.write("Aborted. Nothing removed.\n");
            process.exit(1);
          }
        }

        const result = runLogout({ dryRun: !!opts.dryRun });

        if (jsonMode) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          return;
        }
        process.stdout.write(renderHuman(result));
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
      }
    });
}
