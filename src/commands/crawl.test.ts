import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Command } from "commander";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerCrawl } from "./crawl.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerCrawl(program);
  return program;
}

/**
 * Build a minimal fake Response object for the fetch stub.
 */
function fakeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    text: (): Promise<string> => Promise.resolve(JSON.stringify(body)),
  };
}

/**
 * Stub global fetch with a queue of ordered responses. Each call to fetch
 * consumes the next response in the queue.
 */
function stubFetchSequence(...responses: Array<{ ok: boolean; status: number; body: unknown }>): ReturnType<typeof vi.fn> {
  const mock = vi.fn();
  for (const r of responses) {
    mock.mockResolvedValueOnce(fakeResponse(r.body, r.ok, r.status));
  }
  vi.stubGlobal("fetch", mock);
  return mock;
}

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

const CRAWL_CREATED = { id: "crawl_abc123", status: "in_progress" };
const CRAWL_IN_PROGRESS = { id: "crawl_abc123", status: "in_progress" };
const CRAWL_COMPLETED = { id: "crawl_abc123", status: "completed" };

const PAGES_RESPONSE_SINGLE = {
  pages: [{ retrieve_id: "ret_001", url: "https://example.com/page1" }],
  cursor: null,
};

const RETRIEVE_RESPONSE = {
  retrieve_id: "ret_001",
  markdown: "# Example Page",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("crawl command", () => {
  let stdoutChunks: string[];
  let originalStdoutWrite: typeof process.stdout.write;

  let originalExit: typeof process.exit;

  beforeEach(() => {
    stdoutChunks = [];
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    };
    process.env.OLOSTEP_API_KEY = "test-key";
    // Prevent process.exit(1) from actually killing vitest; turn it into a
    // thrown error so tests can assert on it with rejects.toThrow().
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? ""})`);
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.exit = originalExit;
    vi.unstubAllGlobals();
    delete process.env.OLOSTEP_API_KEY;
  });

  // -------------------------------------------------------------------------
  // 1. Creates crawl with correct payload
  // -------------------------------------------------------------------------

  it("POSTs to /crawls with start_url and max_pages in the payload", async () => {
    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: CRAWL_CREATED },
      { ok: true, status: 200, body: CRAWL_COMPLETED },
      { ok: true, status: 200, body: PAGES_RESPONSE_SINGLE },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "crawl", "https://example.com",
      "--max-pages", "10",
      "--poll-seconds", "0.1",
      "--poll-timeout", "10",
    ]);

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toMatch(/\/crawls$/);
    expect(createInit.method).toBe("POST");
    const body = JSON.parse(createInit.body as string);
    expect(body.start_url).toBe("https://example.com");
    expect(body.max_pages).toBe(10);
  });

  // -------------------------------------------------------------------------
  // 2. Polls until status = "completed" (first response in_progress, second completed)
  // -------------------------------------------------------------------------

  it("polls GET /crawls/{id} until status is completed", async () => {
    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: CRAWL_CREATED },        // POST /crawls
      { ok: true, status: 200, body: CRAWL_IN_PROGRESS },    // GET /crawls/crawl_abc123 — first poll
      { ok: true, status: 200, body: CRAWL_COMPLETED },      // GET /crawls/crawl_abc123 — second poll
      { ok: true, status: 200, body: PAGES_RESPONSE_SINGLE },// GET /crawls/crawl_abc123/pages
      { ok: true, status: 200, body: RETRIEVE_RESPONSE },    // GET /retrieve
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "crawl", "https://example.com",
      "--poll-seconds", "0.1",
      "--poll-timeout", "10",
    ]);

    // At least 3 calls: create + 2 polls (+ pages + retrieve)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);

    const pollUrl1 = (fetchMock.mock.calls[1] as [string, RequestInit])[0];
    const pollUrl2 = (fetchMock.mock.calls[2] as [string, RequestInit])[0];
    expect(pollUrl1).toMatch(/\/crawls\/crawl_abc123$/);
    expect(pollUrl2).toMatch(/\/crawls\/crawl_abc123$/);
  });

  // -------------------------------------------------------------------------
  // 3. --dry-run makes zero API calls and prints what it would do
  // -------------------------------------------------------------------------

  it("--dry-run prints payload JSON and makes no API calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "crawl", "https://example.com",
      "--max-pages", "5",
      "--dry-run",
    ]);

    expect(fetchMock).not.toHaveBeenCalled();

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.start_url).toBe("https://example.com");
    expect(parsed.max_pages).toBe(5);
  });

  // -------------------------------------------------------------------------
  // 4. --max-pages flag is forwarded in the payload
  // -------------------------------------------------------------------------

  it("forwards --max-pages to the API payload", async () => {
    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: CRAWL_CREATED },
      { ok: true, status: 200, body: CRAWL_COMPLETED },
      { ok: true, status: 200, body: { pages: [], cursor: null } },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "crawl", "https://example.com",
      "--max-pages", "99",
      "--poll-seconds", "0.1",
      "--poll-timeout", "10",
    ]);

    const [, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(createInit.body as string);
    expect(body.max_pages).toBe(99);
  });

  // -------------------------------------------------------------------------
  // 5. API error (fetch returns ok: false) causes the command to throw
  // -------------------------------------------------------------------------

  it("writes error to stderr and calls process.exit when the API returns an error response", async () => {
    stubFetchSequence({
      ok: false,
      status: 422,
      body: { error: "invalid_url", message: "Bad URL" },
    });

    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    try {
      const program = makeProgram();
      await expect(
        program.parseAsync([
          "node", "cli", "crawl", "https://example.com",
          "--poll-seconds", "0.1",
          "--poll-timeout", "10",
        ]),
      ).rejects.toThrow(/process\.exit/);

      const stderrOutput = stderrChunks.join("");
      expect(stderrOutput).toMatch(/Error:/);
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  // -------------------------------------------------------------------------
  // 6. Output is always JSON (writeOutput is always called)
  // -------------------------------------------------------------------------

  it("writes valid JSON to stdout after a successful crawl", async () => {
    stubFetchSequence(
      { ok: true, status: 200, body: CRAWL_CREATED },
      { ok: true, status: 200, body: CRAWL_COMPLETED },
      { ok: true, status: 200, body: PAGES_RESPONSE_SINGLE },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "crawl", "https://example.com",
      "--poll-seconds", "0.1",
      "--poll-timeout", "10",
    ]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.crawl_id).toBe("crawl_abc123");
    expect(parsed.results).toBeInstanceOf(Array);
    expect(parsed.results_count).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // 7. --out flag writes JSON to file instead of stdout
  // -------------------------------------------------------------------------

  it("writes JSON to --out file instead of stdout", async () => {
    stubFetchSequence(
      { ok: true, status: 200, body: CRAWL_CREATED },
      { ok: true, status: 200, body: CRAWL_COMPLETED },
      { ok: true, status: 200, body: { pages: [], cursor: null } },
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crawl-test-"));
    const outFile = path.join(tmpDir, "out.json");
    try {
      const program = makeProgram();
      await program.parseAsync([
        "node", "cli", "crawl", "https://example.com",
        "--out", outFile,
        "--poll-seconds", "0.1",
        "--poll-timeout", "10",
      ]);

      expect(stdoutChunks.join("")).toBe("");
      const written = JSON.parse(fs.readFileSync(outFile, "utf8"));
      expect(written.crawl_id).toBe("crawl_abc123");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // 8. --dry-run includes _retrieve_formats in printed payload
  // -------------------------------------------------------------------------

  it("--dry-run payload includes _retrieve_formats from --formats flag", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "crawl", "https://example.com",
      "--formats", "markdown,html",
      "--dry-run",
    ]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed._retrieve_formats).toEqual(["markdown", "html"]);
  });
});
