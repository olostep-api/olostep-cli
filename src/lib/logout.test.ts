import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ENV_API_KEY,
  ENV_API_TOKEN,
  ENV_CONFIG_DIR,
  getCredentialsPath,
  writeCredentialsApiKey,
} from "./config.js";
import { runLogout } from "./logout.js";

const SAVED_ENV_KEYS = [ENV_API_KEY, ENV_API_TOKEN, ENV_CONFIG_DIR];
let savedEnv: Record<string, string | undefined> = {};
let tmpDir: string;
let workDir: string;

beforeEach(() => {
  savedEnv = {};
  for (const k of SAVED_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "olostep-logout-test-"));
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "olostep-logout-cwd-"));
  process.env[ENV_CONFIG_DIR] = tmpDir;
});

afterEach(() => {
  for (const k of SAVED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("runLogout", () => {
  it("removes credentials.json when present and reports it", () => {
    writeCredentialsApiKey("file-key");
    const result = runLogout({ cwd: workDir });
    expect(result.removedCredentials).toBe(true);
    expect(result.credentialsPath).toBe(getCredentialsPath());
    expect(fs.existsSync(getCredentialsPath())).toBe(false);
    expect(result.fullySignedOut).toBe(true);
  });

  it("is idempotent when credentials.json is already missing", () => {
    expect(fs.existsSync(getCredentialsPath())).toBe(false);
    const result = runLogout({ cwd: workDir });
    expect(result.removedCredentials).toBe(false);
    expect(result.fullySignedOut).toBe(true);
  });

  it("flags OLOSTEP_API_KEY when set", () => {
    process.env[ENV_API_KEY] = "key-from-env";
    const result = runLogout({ cwd: workDir });
    expect(result.envVarsSet).toContain(ENV_API_KEY);
    expect(result.fullySignedOut).toBe(false);
  });

  it("flags OLOSTEP_API_TOKEN when set", () => {
    process.env[ENV_API_TOKEN] = "token-from-env";
    const result = runLogout({ cwd: workDir });
    expect(result.envVarsSet).toContain(ENV_API_TOKEN);
    expect(result.fullySignedOut).toBe(false);
  });

  it("flags both env vars when both are set", () => {
    process.env[ENV_API_KEY] = "k";
    process.env[ENV_API_TOKEN] = "t";
    const result = runLogout({ cwd: workDir });
    expect(result.envVarsSet).toEqual([ENV_API_KEY, ENV_API_TOKEN]);
  });

  it("does not flag env vars set to whitespace", () => {
    process.env[ENV_API_KEY] = "   ";
    const result = runLogout({ cwd: workDir });
    expect(result.envVarsSet).toEqual([]);
    expect(result.fullySignedOut).toBe(true);
  });

  it("detects a .env file in cwd that defines OLOSTEP_API_KEY", () => {
    fs.writeFileSync(path.join(workDir, ".env"), "OLOSTEP_API_KEY=from-dotenv\n");
    const result = runLogout({ cwd: workDir });
    expect(result.envFilesWithKey).toEqual([path.join(workDir, ".env")]);
    expect(result.fullySignedOut).toBe(false);
  });

  it("detects a .env file with OLOSTEP_API_TOKEN", () => {
    fs.writeFileSync(path.join(workDir, ".env"), "OLOSTEP_API_TOKEN=tok\n");
    const result = runLogout({ cwd: workDir });
    expect(result.envFilesWithKey).toEqual([path.join(workDir, ".env")]);
  });

  it("ignores a .env file that only mentions OLOSTEP_API_KEY in a comment", () => {
    fs.writeFileSync(path.join(workDir, ".env"), "# OLOSTEP_API_KEY=foo\nOTHER=1\n");
    const result = runLogout({ cwd: workDir });
    expect(result.envFilesWithKey).toEqual([]);
    expect(result.fullySignedOut).toBe(true);
  });

  it("ignores a .env file where the key value is empty", () => {
    fs.writeFileSync(path.join(workDir, ".env"), "OLOSTEP_API_KEY=\n");
    const result = runLogout({ cwd: workDir });
    expect(result.envFilesWithKey).toEqual([]);
  });

  it("reports fullySignedOut=true after removing creds with no env / no .env", () => {
    writeCredentialsApiKey("k");
    const result = runLogout({ cwd: workDir });
    expect(result.removedCredentials).toBe(true);
    expect(result.envVarsSet).toEqual([]);
    expect(result.envFilesWithKey).toEqual([]);
    expect(result.fullySignedOut).toBe(true);
  });

  describe("dry-run", () => {
    it("does NOT delete credentials.json in dry-run mode", () => {
      writeCredentialsApiKey("k");
      const result = runLogout({ cwd: workDir, dryRun: true });
      expect(result.dryRun).toBe(true);
      expect(result.credentialsExisted).toBe(true);
      expect(result.removedCredentials).toBe(true); // *would* be removed
      expect(fs.existsSync(getCredentialsPath())).toBe(true); // still there
    });

    it("reports credentialsExisted=false in dry-run when no file", () => {
      const result = runLogout({ cwd: workDir, dryRun: true });
      expect(result.dryRun).toBe(true);
      expect(result.credentialsExisted).toBe(false);
      expect(result.removedCredentials).toBe(false);
    });

    it("still detects env vars in dry-run", () => {
      process.env[ENV_API_KEY] = "k";
      const result = runLogout({ cwd: workDir, dryRun: true });
      expect(result.envVarsSet).toContain(ENV_API_KEY);
      expect(result.fullySignedOut).toBe(false);
    });
  });

  describe("credentialsExisted reporting", () => {
    it("reports credentialsExisted=true and removedCredentials=true after a real removal", () => {
      writeCredentialsApiKey("k");
      const result = runLogout({ cwd: workDir });
      expect(result.credentialsExisted).toBe(true);
      expect(result.removedCredentials).toBe(true);
    });

    it("reports credentialsExisted=false and removedCredentials=false when no file", () => {
      const result = runLogout({ cwd: workDir });
      expect(result.credentialsExisted).toBe(false);
      expect(result.removedCredentials).toBe(false);
    });
  });
});
