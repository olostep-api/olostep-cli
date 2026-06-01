import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkAuthPresent,
  checkClientConfigs,
  runDoctor,
  type CheckResult,
} from "./doctor.js";
import { registerDoctor } from "./doctor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit from killing vitest
  registerDoctor(program);
  return program;
}

function captureStdout(): { chunks: string[]; restore: () => void } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: any) => {
    chunks.push(String(chunk));
    return true;
  };
  return { chunks, restore: () => { process.stdout.write = original; } };
}

// ---------------------------------------------------------------------------
// auth.present check
// ---------------------------------------------------------------------------

describe("checkAuthPresent()", () => {
  let originalApiKey: string | undefined;
  let originalApiToken: string | undefined;
  let originalConfigDir: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalApiKey = process.env.OLOSTEP_API_KEY;
    originalApiToken = process.env.OLOSTEP_API_TOKEN;
    originalConfigDir = process.env.OLOSTEP_CLI_CONFIG_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-test-"));
    // Point credentials at an empty tmp dir so there's no pre-existing credentials.json
    process.env.OLOSTEP_CLI_CONFIG_DIR = tmpDir;
    delete process.env.OLOSTEP_API_KEY;
    delete process.env.OLOSTEP_API_TOKEN;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OLOSTEP_API_KEY;
    } else {
      process.env.OLOSTEP_API_KEY = originalApiKey;
    }
    if (originalApiToken === undefined) {
      delete process.env.OLOSTEP_API_TOKEN;
    } else {
      process.env.OLOSTEP_API_TOKEN = originalApiToken;
    }
    if (originalConfigDir === undefined) {
      delete process.env.OLOSTEP_CLI_CONFIG_DIR;
    } else {
      process.env.OLOSTEP_CLI_CONFIG_DIR = originalConfigDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns ok when OLOSTEP_API_KEY is set", () => {
    process.env.OLOSTEP_API_KEY = "sk-test-abc";
    const result = checkAuthPresent();
    expect(result.id).toBe("auth.present");
    expect(result.status).toBe("ok");
    expect(result.message).toContain("OLOSTEP_API_KEY");
  });

  it("returns ok when OLOSTEP_API_TOKEN is set", () => {
    process.env.OLOSTEP_API_TOKEN = "tok-test-xyz";
    const result = checkAuthPresent();
    expect(result.id).toBe("auth.present");
    expect(result.status).toBe("ok");
    expect(result.message).toContain("OLOSTEP_API_TOKEN");
  });

  it("returns ok when credentials.json exists", () => {
    const credFile = path.join(tmpDir, "credentials.json");
    fs.writeFileSync(credFile, JSON.stringify({ api_key: "sk-cred-123" }));
    const result = checkAuthPresent();
    expect(result.id).toBe("auth.present");
    expect(result.status).toBe("ok");
    expect(result.message).toContain("credentials.json");
  });

  it("returns fail when no key is found", () => {
    const result = checkAuthPresent();
    expect(result.id).toBe("auth.present");
    expect(result.status).toBe("fail");
    expect(result.message).toContain("No API key");
  });
});

// ---------------------------------------------------------------------------
// checkClientConfigs — uses real fs detection (no mocks needed; paths checked
//                       only if the probe path exists on the machine)
// ---------------------------------------------------------------------------

describe("checkClientConfigs()", () => {
  it("returns an array of CheckResult objects", () => {
    const results = checkClientConfigs();
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r.id).toMatch(/^client\..+\.config\.exists$/);
      expect(["ok", "warn", "fail", "skip"]).toContain(r.status);
      expect(typeof r.message).toBe("string");
    }
  });

  it("only includes agents whose probe paths exist on disk", () => {
    // All returned IDs must correspond to detected agents.
    // We can't know which ones are detected without re-running the logic, but
    // we can verify that the IDs are well-formed and no unknown status is used.
    const results = checkClientConfigs();
    for (const r of results) {
      expect(["ok", "warn"]).toContain(r.status);
    }
  });
});

// ---------------------------------------------------------------------------
// Human output format
// ---------------------------------------------------------------------------

describe("doctor command — human output", () => {
  let capture: ReturnType<typeof captureStdout>;
  let originalApiKey: string | undefined;
  let tmpDir: string;
  let originalConfigDir: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExit: any;

  beforeEach(() => {
    originalApiKey = process.env.OLOSTEP_API_KEY;
    originalConfigDir = process.env.OLOSTEP_CLI_CONFIG_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-human-"));
    process.env.OLOSTEP_CLI_CONFIG_DIR = tmpDir;
    capture = captureStdout();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve("{}") })));
    // Suppress process.exit so tests don't abort the runner.
    mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    mockExit.mockRestore();
    capture.restore();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.OLOSTEP_API_KEY;
    } else {
      process.env.OLOSTEP_API_KEY = originalApiKey;
    }
    if (originalConfigDir === undefined) {
      delete process.env.OLOSTEP_CLI_CONFIG_DIR;
    } else {
      process.env.OLOSTEP_CLI_CONFIG_DIR = originalConfigDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints human-readable lines with check IDs", async () => {
    process.env.OLOSTEP_API_KEY = "sk-test-key";
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "doctor", "--skip-network"]);

    const output = capture.chunks.join("");
    expect(output).toContain("auth.present");
  });

  it("prints ok symbol for valid key", async () => {
    process.env.OLOSTEP_API_KEY = "sk-valid-key";
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "doctor", "--skip-network"]);

    const output = capture.chunks.join("");
    // The ok symbol ✓ should appear at least once
    expect(output).toContain("✓");
  });

  it("prints fail symbol when no key", async () => {
    delete process.env.OLOSTEP_API_KEY;
    delete process.env.OLOSTEP_API_TOKEN;
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "doctor", "--skip-network"]);

    const output = capture.chunks.join("");
    expect(output).toContain("✗");
    // process.exit(1) should have been called
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// JSON (NDJSON) output format
// ---------------------------------------------------------------------------

describe("doctor command — JSON output", () => {
  let capture: ReturnType<typeof captureStdout>;
  let originalApiKey: string | undefined;
  let originalConfigDir: string | undefined;
  let tmpDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExit: any;

  beforeEach(() => {
    originalApiKey = process.env.OLOSTEP_API_KEY;
    originalConfigDir = process.env.OLOSTEP_CLI_CONFIG_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-json-"));
    process.env.OLOSTEP_CLI_CONFIG_DIR = tmpDir;
    capture = captureStdout();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve("{}") })));
    mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    mockExit.mockRestore();
    capture.restore();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.OLOSTEP_API_KEY;
    } else {
      process.env.OLOSTEP_API_KEY = originalApiKey;
    }
    if (originalConfigDir === undefined) {
      delete process.env.OLOSTEP_CLI_CONFIG_DIR;
    } else {
      process.env.OLOSTEP_CLI_CONFIG_DIR = originalConfigDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits valid NDJSON lines with id/status/message", async () => {
    process.env.OLOSTEP_API_KEY = "sk-test-key";
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "doctor", "--json", "--skip-network"]);

    const output = capture.chunks.join("");
    const lines = output.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      const obj = JSON.parse(line) as CheckResult;
      expect(typeof obj.id).toBe("string");
      expect(["ok", "fail", "warn", "skip"]).toContain(obj.status);
      expect(typeof obj.message).toBe("string");
    }
  });

  it("first NDJSON line is auth.present", async () => {
    process.env.OLOSTEP_API_KEY = "sk-test-key";
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "doctor", "--json", "--skip-network"]);

    const output = capture.chunks.join("");
    const firstLine = output.trim().split("\n")[0];
    const obj = JSON.parse(firstLine) as CheckResult;
    expect(obj.id).toBe("auth.present");
    expect(obj.status).toBe("ok");
  });

  it("auth.present shows fail in NDJSON when no key", async () => {
    delete process.env.OLOSTEP_API_KEY;
    delete process.env.OLOSTEP_API_TOKEN;
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "doctor", "--json", "--skip-network"]);

    const output = capture.chunks.join("");
    const firstLine = output.trim().split("\n")[0];
    const obj = JSON.parse(firstLine) as CheckResult;
    expect(obj.id).toBe("auth.present");
    expect(obj.status).toBe("fail");
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

describe("runDoctor() exit codes", () => {
  let originalApiKey: string | undefined;
  let originalConfigDir: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalApiKey = process.env.OLOSTEP_API_KEY;
    originalConfigDir = process.env.OLOSTEP_CLI_CONFIG_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-exit-"));
    process.env.OLOSTEP_CLI_CONFIG_DIR = tmpDir;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve("{}") })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.OLOSTEP_API_KEY;
    } else {
      process.env.OLOSTEP_API_KEY = originalApiKey;
    }
    if (originalConfigDir === undefined) {
      delete process.env.OLOSTEP_CLI_CONFIG_DIR;
    } else {
      process.env.OLOSTEP_CLI_CONFIG_DIR = originalConfigDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 0 when all checks pass", async () => {
    process.env.OLOSTEP_API_KEY = "sk-good-key";
    const { exitCode } = await runDoctor({ skipNetwork: true });
    expect(exitCode).toBe(0);
  });

  it("exits 1 when auth.present fails", async () => {
    delete process.env.OLOSTEP_API_KEY;
    delete process.env.OLOSTEP_API_TOKEN;
    const { exitCode } = await runDoctor({ skipNetwork: true });
    expect(exitCode).toBe(1);
  });

  it("exits 0 when warn is present but --fail-on-warn is not set", async () => {
    process.env.OLOSTEP_API_KEY = "sk-good-key";
    // Inject a fake network error to produce a warn on mcp.endpoint.reachable
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    const { exitCode, results } = await runDoctor({ skipNetwork: false });
    const warnResults = results.filter((r) => r.status === "warn");
    // We expect warns from network checks
    expect(warnResults.length).toBeGreaterThan(0);
    expect(exitCode).toBe(0);
  });

  it("exits 1 when warn is present and --fail-on-warn is set", async () => {
    process.env.OLOSTEP_API_KEY = "sk-good-key";
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    const { exitCode } = await runDoctor({ skipNetwork: false, failOnWarn: true });
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// --skip-network flag
// ---------------------------------------------------------------------------

describe("--skip-network flag", () => {
  let originalApiKey: string | undefined;
  let originalConfigDir: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalApiKey = process.env.OLOSTEP_API_KEY;
    originalConfigDir = process.env.OLOSTEP_CLI_CONFIG_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-skipnet-"));
    process.env.OLOSTEP_CLI_CONFIG_DIR = tmpDir;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.OLOSTEP_API_KEY;
    } else {
      process.env.OLOSTEP_API_KEY = originalApiKey;
    }
    if (originalConfigDir === undefined) {
      delete process.env.OLOSTEP_CLI_CONFIG_DIR;
    } else {
      process.env.OLOSTEP_CLI_CONFIG_DIR = originalConfigDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not call fetch when --skip-network is set", async () => {
    process.env.OLOSTEP_API_KEY = "sk-test-key";
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await runDoctor({ skipNetwork: true });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("includes auth.reachable and mcp.endpoint.reachable with status 'skip' when --skip-network is set", async () => {
    process.env.OLOSTEP_API_KEY = "sk-test-key";
    vi.stubGlobal("fetch", vi.fn());

    const { results } = await runDoctor({ skipNetwork: true });
    const ids = results.map((r) => r.id);

    expect(ids).toContain("auth.present");
    expect(ids).toContain("auth.reachable");
    expect(ids).toContain("mcp.endpoint.reachable");

    const authReachable = results.find((r) => r.id === "auth.reachable")!;
    expect(authReachable.status).toBe("skip");
    expect(authReachable.message).toContain("--skip-network");

    const mcpReachable = results.find((r) => r.id === "mcp.endpoint.reachable")!;
    expect(mcpReachable.status).toBe("skip");
    expect(mcpReachable.message).toContain("--skip-network");
  });

  it("includes auth.reachable and mcp.endpoint.reachable when --skip-network is not set", async () => {
    process.env.OLOSTEP_API_KEY = "sk-test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve("{}") })),
    );

    const { results } = await runDoctor({ skipNetwork: false });
    const ids = results.map((r) => r.id);

    expect(ids).toContain("auth.reachable");
    expect(ids).toContain("mcp.endpoint.reachable");
  });
});
