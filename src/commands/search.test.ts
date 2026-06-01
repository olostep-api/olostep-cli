import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Command } from "commander";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerSearch } from "./search.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit from killing vitest
  registerSearch(program);
  return program;
}

const MOCK_RESPONSE = {
  id: "srch_abc123",
  result: {
    links: [
      { url: "https://example.com", title: "Example", description: "An example site" },
      { url: "https://test.org", title: "Test Org", description: "A test org" },
    ],
  },
};

function stubFetch(response: unknown, ok = true, _status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((): Promise<any> =>
      Promise.resolve({
        ok,
        status: _status,
        statusText: ok ? "OK" : "Bad Request",
        text: (): Promise<string> => Promise.resolve(JSON.stringify(response)),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("search command", () => {
  let stdoutChunks: string[];
  let originalStdoutWrite: typeof process.stdout.write;

  beforeEach(() => {
    stdoutChunks = [];
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    };
    // Stub process env so resolveApiKey doesn't throw.
    process.env.OLOSTEP_API_KEY = "test-key";
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    vi.unstubAllGlobals();
    delete process.env.OLOSTEP_API_KEY;
  });

  it("calls POST /v1/searches with the query and no limit by default", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "search", "hello world"]);

    const fetchMock = (global as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/searches$/);
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe("hello world");
    expect(body.limit).toBeUndefined();
  });

  it("passes --limit to the API payload", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "search", "test", "--limit", "5"]);

    const fetchMock = (global as any).fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.limit).toBe(5);
  });

  it("passes --include-domains as an array", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "search", "test",
      "--include-domains", "wikipedia.org,bbc.com",
    ]);

    const fetchMock = (global as any).fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.include_domains).toEqual(["wikipedia.org", "bbc.com"]);
  });

  it("passes --exclude-domains as an array", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "search", "test",
      "--exclude-domains", "spam.com",
    ]);

    const fetchMock = (global as any).fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.exclude_domains).toEqual(["spam.com"]);
  });

  it("prints human-readable output by default", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "search", "test"]);

    const output = stdoutChunks.join("");
    expect(output).toContain("1. Example");
    expect(output).toContain("https://example.com");
    expect(output).toContain("An example site");
    expect(output).toContain("2. Test Org");
  });

  it("prints JSON output when --json flag is set", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "search", "test", "--json"]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("srch_abc123");
    expect(parsed.links).toHaveLength(2);
    expect(parsed.links[0].url).toBe("https://example.com");
  });

  it("throws when --limit exceeds 25", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    await expect(
      program.parseAsync(["node", "cli", "search", "test", "--limit", "30"]),
    ).rejects.toThrow("--limit must be <= 25");
  });

  it("prints 'No results found.' when links array is empty", async () => {
    stubFetch({ id: "srch_empty", result: { links: [] } });
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "search", "nothing"]);

    const output = stdoutChunks.join("");
    expect(output).toContain("No results found.");
  });

  it("writes JSON to --out file when --json is set", async () => {
    stubFetch(MOCK_RESPONSE);
    const program = makeProgram();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "search-test-"));
    const outFile = path.join(tmpDir, "out.json");
    try {
      await program.parseAsync([
        "node", "cli", "search", "test", "--json", "--out", outFile,
      ]);

      // Nothing written to stdout
      expect(stdoutChunks.join("")).toBe("");
      const written = JSON.parse(fs.readFileSync(outFile, "utf8"));
      expect(written.id).toBe("srch_abc123");
      expect(written.links).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on API error response", async () => {
    stubFetch({ error: "invalid_api_key", message: "Unauthorized" }, false, 401);
    const program = makeProgram();
    await expect(
      program.parseAsync(["node", "cli", "search", "test"]),
    ).rejects.toThrow();
  });
});
