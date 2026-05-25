import { Command } from "commander";

import {
  ENV_API_KEY,
  ENV_API_TOKEN,
  getConfigDir,
  getCredentialsPath,
  loadEnvFile,
  readCredentialsApiKey,
} from "../lib/config.js";
import { c, sym } from "../lib/colors.js";

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

export function registerStatus(program: Command, version: string): void {
  program
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
      if (opts.json) {
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
}
