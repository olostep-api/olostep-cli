import { Command } from "commander";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { registerVersion } from "./version.js";

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit from killing vitest
  registerVersion(program, "0.2.1");
  return program;
}

describe("version", () => {
  let stdoutChunks: string[];
  let originalStdoutWrite: typeof process.stdout.write;

  beforeEach(() => {
    stdoutChunks = [];
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  it("prints human-readable output", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "version"]);

    const output = stdoutChunks.join("");
    expect(output).toContain("olostep 0.2.1");
    expect(output).toContain("node v");
    expect(output).toContain("channel: stable");
  });

  it("prints JSON output when --json flag is set", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "version", "--json"]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.cli).toBe("0.2.1");
    expect(parsed.node).toContain("v");
    expect(parsed.channel).toBe("stable");
  });

  it("prints JSON output when OLOSTEP_JSON env var is set", async () => {
    const program = makeProgram();
    const originalEnv = process.env.OLOSTEP_JSON;
    try {
      process.env.OLOSTEP_JSON = "true";
      stdoutChunks = [];
      await program.parseAsync(["node", "cli", "version"]);

      const output = stdoutChunks.join("");
      const parsed = JSON.parse(output);
      expect(parsed.cli).toBe("0.2.1");
      expect(parsed.node).toContain("v");
      expect(parsed.channel).toBe("stable");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.OLOSTEP_JSON;
      } else {
        process.env.OLOSTEP_JSON = originalEnv;
      }
    }
  });

  it("version output matches format 'olostep X.Y.Z'", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "version"]);

    const output = stdoutChunks.join("");
    const lines = output.trim().split("\n");
    expect(lines[0]).toMatch(/^olostep \d+\.\d+\.\d+/);
  });

  it("includes process.version in output", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "version"]);

    const output = stdoutChunks.join("");
    expect(output).toContain(process.version);
  });

  it("channel is always 'stable'", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "version", "--json"]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.channel).toBe("stable");
  });
});
