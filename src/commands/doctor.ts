/**
 * olostep doctor — run a series of self-checks and report their status.
 *
 * Checks (in order):
 *   1. auth.present          — is an API key configured?
 *   2. auth.reachable        — does the key work? (GET /v1/account)
 *   3. mcp.endpoint.reachable — is the MCP endpoint up? (GET mcp.olostep.com/health)
 *   4. client.<name>.config.exists — for each detected agent, does the config file exist?
 */

import * as fs from "node:fs";

import { Command } from "commander";

import { c } from "../lib/colors.js";
import { ENV_API_KEY, ENV_API_TOKEN, resolveApiKey } from "../lib/config.js";
import { agentConfigs } from "../lib/mcp.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = "ok" | "fail" | "warn" | "skip";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** Check 1: is an API key present? */
export function checkAuthPresent(): CheckResult {
  const id = "auth.present";
  try {
    resolveApiKey();
    // Determine the source for a friendlier message.
    const envKey = (process.env[ENV_API_KEY] || "").trim();
    const envTok = (process.env[ENV_API_TOKEN] || "").trim();
    if (envKey) {
      return { id, status: "ok", message: `API key found (${ENV_API_KEY})` };
    }
    if (envTok) {
      return { id, status: "ok", message: `API key found (${ENV_API_TOKEN})` };
    }
    return { id, status: "ok", message: "API key found (credentials.json)" };
  } catch {
    return { id, status: "fail", message: "No API key configured" };
  }
}

/** Check 2: does the key work against the live API? */
export async function checkAuthReachable(apiKey: string): Promise<CheckResult> {
  const id = "auth.reachable";
  const url = "https://api.olostep.com/v1/account";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "olostep-cli (node)",
      },
      signal: controller.signal,
    });
    if (res.status === 200) {
      return { id, status: "ok", message: "API key valid (HTTP 200)" };
    }
    if (res.status === 401) {
      return { id, status: "fail", message: "API key invalid (HTTP 401)" };
    }
    // Any other non-200 is treated as a warning (unexpected response).
    return { id, status: "warn", message: `Unexpected response (HTTP ${res.status})` };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { id, status: "warn", message: "Request timed out" };
    }
    return { id, status: "warn", message: `Network error: ${err?.message || err}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Check 3: is the MCP endpoint healthy? */
export async function checkMcpEndpointReachable(): Promise<CheckResult> {
  const id = "mcp.endpoint.reachable";
  const url = "https://mcp.olostep.com/health";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "olostep-cli (node)" },
      signal: controller.signal,
    });
    if (res.status === 200) {
      return { id, status: "ok", message: "MCP endpoint reachable (HTTP 200)" };
    }
    return { id, status: "warn", message: `MCP endpoint returned HTTP ${res.status}` };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { id, status: "warn", message: "MCP endpoint request timed out" };
    }
    return { id, status: "warn", message: `MCP endpoint unreachable: ${err?.message || err}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Check 4: for each detected agent, does the globalConfig file exist? */
export function checkClientConfigs(): CheckResult[] {
  const cfgs = agentConfigs();
  const results: CheckResult[] = [];
  for (const [name, cfg] of Object.entries(cfgs)) {
    // Only report agents that are detected (at least one probePath exists on disk).
    const detected = cfg.probePaths.some((p) => fs.existsSync(p));
    if (!detected) continue;

    const configExists = fs.existsSync(cfg.globalConfig);
    const id = `client.${name}.config.exists`;
    if (configExists) {
      results.push({ id, status: "ok", message: `${cfg.globalConfig} found` });
    } else {
      results.push({ id, status: "warn", message: `${cfg.globalConfig} not found` });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const WARN_SYM = "⚠";

function statusSymbol(status: CheckStatus): string {
  if (status === "ok") return c.green("✓");
  if (status === "fail") return c.red("✗");
  if (status === "warn") return c.yellow(WARN_SYM);
  return c.yellow("-");
}

function humanLine(result: CheckResult): string {
  const sym = statusSymbol(result.status);
  const id = result.id.padEnd(36);
  return `  ${sym}  ${id}  ${result.message}`;
}

function ndjsonLine(result: CheckResult): string {
  return JSON.stringify({ id: result.id, status: result.status, message: result.message });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface DoctorOptions {
  json?: boolean;
  skipNetwork?: boolean;
  failOnWarn?: boolean;
}

export async function runDoctor(opts: DoctorOptions): Promise<{ results: CheckResult[]; exitCode: number }> {
  const results: CheckResult[] = [];

  // 1. auth.present
  const authPresent = checkAuthPresent();
  results.push(authPresent);

  let resolvedKey: string | null = null;
  if (authPresent.status === "ok") {
    try { resolvedKey = resolveApiKey(); } catch { /* ignore */ }
  }

  // 2. auth.reachable
  if (!opts.skipNetwork) {
    if (authPresent.status === "ok" && resolvedKey !== null) {
      results.push(await checkAuthReachable(resolvedKey));
    }
    // 3. mcp.endpoint.reachable
    results.push(await checkMcpEndpointReachable());
  }

  // 4. client config checks (no network needed)
  results.push(...checkClientConfigs());

  // Determine exit code
  const hasFail = results.some((r) => r.status === "fail");
  const hasWarn = results.some((r) => r.status === "warn");
  const exitCode = hasFail || (opts.failOnWarn && hasWarn) ? 1 : 0;

  return { results, exitCode };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Run self-checks: auth, network reachability, and agent config detection.")
    .option("--json", "NDJSON output (one JSON object per line)")
    .option("--skip-network", "Skip network checks (auth.reachable, mcp.endpoint.reachable)")
    .option("--fail-on-warn", "Exit with code 1 if any check has status 'warn'")
    .action(async (opts) => {
      const { results, exitCode } = await runDoctor({
        json: opts.json as boolean | undefined,
        skipNetwork: opts.skipNetwork as boolean | undefined,
        failOnWarn: opts.failOnWarn as boolean | undefined,
      });

      if (opts.json) {
        for (const r of results) {
          process.stdout.write(ndjsonLine(r) + "\n");
        }
      } else {
        process.stdout.write("\n");
        for (const r of results) {
          process.stdout.write(humanLine(r) + "\n");
        }
        process.stdout.write("\n");
      }

      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}
