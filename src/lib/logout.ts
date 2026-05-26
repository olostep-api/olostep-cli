import * as fs from "node:fs";
import * as path from "node:path";

import {
  ENV_API_KEY,
  ENV_API_TOKEN,
  getCredentialsPath,
} from "./config.js";

export interface LogoutResult {
  /** True iff a credentials.json was found and removed (or *would* be in dry-run). */
  removedCredentials: boolean;
  /** True iff a credentials.json exists at credentialsPath (pre-removal state). */
  credentialsExisted: boolean;
  credentialsPath: string;
  /** Env vars set in the current process that still hold a key. */
  envVarsSet: string[];
  /** Paths of .env files in cwd that define OLOSTEP_API_KEY / OLOSTEP_API_TOKEN. */
  envFilesWithKey: string[];
  /** True iff the user is now fully signed out (no creds file, no env, no .env). */
  fullySignedOut: boolean;
  /** True iff no actual filesystem write happened (dry-run mode). */
  dryRun: boolean;
}

const KEY_LINE_RE = /^\s*OLOSTEP_API_(KEY|TOKEN)\s*=\s*\S/m;

function envFileContainsKey(envPath: string): boolean {
  if (!fs.existsSync(envPath)) return false;
  try {
    return KEY_LINE_RE.test(fs.readFileSync(envPath, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Remove credentials.json (if present) and report what other sources
 * still hold an API key. We do NOT call loadEnvFile() here on purpose:
 * we want to distinguish a shell-set env var (which the user must
 * `unset` / `Remove-Item Env:`) from a .env file (which they edit).
 *
 * `cwd` is parameterized for testability — vitest workers can't chdir.
 * `dryRun` reports what *would* happen without writing.
 *
 * Throws with a friendly message if the unlink fails for a reason other
 * than ENOENT (e.g. EPERM on Windows when the file is open). The caller
 * is expected to surface this to the user without a stack trace.
 */
export function runLogout(opts: { cwd?: string; dryRun?: boolean } = {}): LogoutResult {
  const cwd = opts.cwd || process.cwd();
  const dryRun = !!opts.dryRun;
  // path.resolve guards against accidental relative drift if OLOSTEP_CLI_CONFIG_DIR
  // gets set to something funky; getCredentialsPath already returns absolute,
  // but explicit is better than implicit when we're about to unlink.
  const credentialsPath = path.resolve(getCredentialsPath());
  const credentialsExisted = fs.existsSync(credentialsPath);

  let removedCredentials = false;
  if (credentialsExisted && !dryRun) {
    try {
      fs.unlinkSync(credentialsPath);
      removedCredentials = true;
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        // Race — somebody else removed it between exists() and unlink(). Fine.
      } else {
        const reason = err?.code ? `${err.code}: ${err.message}` : (err?.message || String(err));
        throw new Error(
          `Could not remove credentials file at ${credentialsPath} (${reason}). ` +
          `Close any process that has it open and try again, or delete it manually.`,
        );
      }
    }
  } else if (credentialsExisted && dryRun) {
    removedCredentials = true; // would-have-been-removed
  }

  const envVarsSet: string[] = [];
  for (const v of [ENV_API_KEY, ENV_API_TOKEN]) {
    if ((process.env[v] || "").trim()) envVarsSet.push(v);
  }

  const envFilesWithKey: string[] = [];
  const cwdEnv = path.join(cwd, ".env");
  if (envFileContainsKey(cwdEnv)) envFilesWithKey.push(cwdEnv);

  return {
    removedCredentials,
    credentialsExisted,
    credentialsPath,
    envVarsSet,
    envFilesWithKey,
    fullySignedOut: envVarsSet.length === 0 && envFilesWithKey.length === 0,
    dryRun,
  };
}
