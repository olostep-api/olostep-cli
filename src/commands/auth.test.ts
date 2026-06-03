import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerAuth } from "./auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit from killing vitest
  registerAuth(program, "0.0.0-test");
  return program;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auth set-key", () => {
  let tmpDir: string;
  let stdoutChunks: string[];
  let originalStdoutWrite: typeof process.stdout.write;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-test-"));
    originalConfigDir = process.env.OLOSTEP_CLI_CONFIG_DIR;
    process.env.OLOSTEP_CLI_CONFIG_DIR = tmpDir;

    stdoutChunks = [];
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    if (originalConfigDir === undefined) {
      delete process.env.OLOSTEP_CLI_CONFIG_DIR;
    } else {
      process.env.OLOSTEP_CLI_CONFIG_DIR = originalConfigDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes credentials.json with api_key field", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "auth", "set-key", "sk-test-abc123"]);

    const credFile = path.join(tmpDir, "credentials.json");
    expect(fs.existsSync(credFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(credFile, "utf8"));
    expect(data.api_key).toBe("sk-test-abc123");
  });

  it("prints human-readable confirmation", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "auth", "set-key", "sk-test-abc123"]);

    const output = stdoutChunks.join("");
    expect(output).toContain("API key saved to");
    expect(output).toContain("credentials.json");
  });

  it("prints JSON output when --json flag is set", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "auth", "set-key", "sk-test-abc123", "--json"]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.credentialsPath).toContain("credentials.json");
  });
});
