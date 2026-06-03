import { Command } from "commander";

import { runLogin } from "../lib/auth.js";
import { runLogout } from "../lib/logout.js";
import { writeCredentialsApiKey, getCredentialsPath } from "../lib/config.js";
import { c, sym } from "../lib/colors.js";
import { isJsonMode } from "../lib/output.js";

import * as readline from "node:readline/promises";

import {
  ENV_API_KEY,
  ENV_API_TOKEN,
  getConfigDir,
  loadEnvFile,
  readCredentialsApiKey,
} from "../lib/config.js";

// ---------------------------------------------------------------------------
// Helpers shared with auth status
// ---------------------------------------------------------------------------

interface AuthStatus {
  source: "env" | "credentials" | "none";
  configured: boolean;
  envVar?: string;
  credentialsPath?: string;
}

function describeAuth(): AuthStatus {
  loadEnvFile();
  const envKey = (process.env[ENV_API_KEY] || "").trim();
  const envTok = (process.env[ENV_API_TOKEN] || "").trim();
  if (envKey || envTok) {
    return { source: "env", configured: true, envVar: envKey ? ENV_API_KEY : ENV_API_TOKEN };
  }
  const cred = readCredentialsApiKey();
  if (cred) {
    return { source: "credentials", configured: true, credentialsPath: getCredentialsPath() };
  }
  return { source: "none", configured: false };
}

async function confirmRemoval(filePath: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`Remove credentials file at ${filePath}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// registerAuth
// ---------------------------------------------------------------------------

export function registerAuth(program: Command, version: string): void {
  const authCmd = program.command("auth").description("Manage authentication.");

  // auth login
  authCmd
    .command("login")
    .description("Sign in via browser and save the API key to credentials.json.")
    .option("--no-browser", "Print the authorize URL instead of opening a browser")
    .option("--poll-seconds <n>", "Interval between status polls", "3")
    .option("--timeout <n>", "Give up after this many seconds", "600")
    .action(async (opts) => {
      try {
        await runLogin({
          noBrowser: !opts.browser,
          pollSeconds: Number(opts.pollSeconds),
          timeoutSeconds: Number(opts.timeout),
        });
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
      }
    });

  // auth logout
  authCmd
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
        }
        process.stdout.write(lines.join("\n") + "\n");
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
      }
    });

  // auth status
  authCmd
    .command("status")
    .description("Show CLI version, authentication, and config locations.")
    .option("--json", "Machine-readable JSON output")
    .action((opts) => {
      const auth = describeAuth();
      const payload = {
        version,
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        configDir: getConfigDir(),
        auth,
      };
      if (isJsonMode(opts)) {
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        return;
      }
      const lines: string[] = [];
      lines.push("");
      lines.push(`  ${c.bold(`olostep ${version}`)}`);
      lines.push(`  ${c.dim(`node ${process.version} · ${process.platform}-${process.arch}`)}`);
      lines.push("");
      if (auth.configured) {
        if (auth.source === "env") {
          lines.push(`  ${c.green(sym.ok)} Signed in via ${auth.envVar}`);
        } else {
          lines.push(`  ${c.green(sym.ok)} Signed in (credentials.json)`);
          lines.push(`  ${c.dim(auth.credentialsPath || "")}`);
        }
      } else {
        lines.push(`  ${c.yellow(sym.fail)} Not signed in`);
        lines.push(`  ${c.dim("Run `olostep init` for full setup, or `olostep login` to just sign in.")}`);
      }
      lines.push("");
      lines.push(`  ${c.dim(`config dir: ${getConfigDir()}`)}`);
      lines.push("");
      process.stdout.write(lines.join("\n") + "\n");
    });

  // auth set-key <key>
  authCmd
    .command("set-key <key>")
    .description("Save an API key directly to credentials.json.")
    .option("--json", "Machine-readable JSON output")
    .action((key: string, opts) => {
      try {
        const filePath = writeCredentialsApiKey(key);
        if (isJsonMode(opts)) {
          process.stdout.write(JSON.stringify({ ok: true, credentialsPath: filePath }) + "\n");
          return;
        }
        process.stdout.write(
          `\n  ${c.green(sym.ok)} API key saved to ${c.dim(filePath)}\n\n`,
        );
      } catch (err: any) {
        process.stderr.write(`Error: ${err?.message || err}\n`);
        process.exit(1);
      }
    });

}
