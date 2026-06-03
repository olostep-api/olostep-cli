import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Command } from "commander";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerBatchScrape } from "./batch-scrape.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerBatchScrape(program);
  return program;
}

function fakeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    text: (): Promise<string> => Promise.resolve(JSON.stringify(body)),
  };
}

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

// Minimal valid CSV content — two data rows with custom_id + url columns.
const CSV_CONTENT = "custom_id,url\nrow1,https://example.com\nrow2,https://test.org\n";

const BATCH_CREATED = { id: "batch_xyz789", status: "in_progress", total_urls: 2, completed_urls: 0 };
const BATCH_IN_PROGRESS = { id: "batch_xyz789", status: "in_progress", total_urls: 2, completed_urls: 1 };
const BATCH_COMPLETED = { id: "batch_xyz789", status: "completed", total_urls: 2, completed_urls: 2 };

const BATCH_ITEMS_COMPLETED = {
  items: [
    { custom_id: "row1", url: "https://example.com", retrieve_id: "ret_001" },
    { custom_id: "row2", url: "https://test.org",    retrieve_id: "ret_002" },
  ],
  cursor: null,
};

const BATCH_ITEMS_FAILED = { items: [], cursor: null };

const RETRIEVE_RESPONSE_1 = { retrieve_id: "ret_001", markdown: "# Example" };
const RETRIEVE_RESPONSE_2 = { retrieve_id: "ret_002", markdown: "# Test Org" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("batch-scrape command", () => {
  let stdoutChunks: string[];
  let originalStdoutWrite: typeof process.stdout.write;
  let originalExit: typeof process.exit;
  // Temporary directory created per-test for real CSV files.
  let tmpDir: string;
  let csvFile: string;

  beforeEach(() => {
    stdoutChunks = [];
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    };
    process.env.OLOSTEP_API_KEY = "test-key";
    // Prevent process.exit(1) from killing vitest; convert it to a thrown error.
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? ""})`);
    }) as typeof process.exit;

    // Create a fresh temp directory and write the default CSV fixture.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-test-"));
    csvFile = path.join(tmpDir, "batch.csv");
    fs.writeFileSync(csvFile, CSV_CONTENT, "utf8");
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.exit = originalExit;
    vi.unstubAllGlobals();
    delete process.env.OLOSTEP_API_KEY;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Reads CSV correctly — URLs are parsed and sent in the payload
  // -------------------------------------------------------------------------

  it("reads CSV and sends parsed URLs in the batch payload", async () => {
    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: BATCH_CREATED },
      { ok: true, status: 200, body: BATCH_COMPLETED },
      { ok: true, status: 200, body: BATCH_ITEMS_COMPLETED },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_1 },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_2 },
      { ok: true, status: 200, body: BATCH_ITEMS_FAILED },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--poll-seconds", "0.1",
    ]);

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toMatch(/\/batches$/);
    expect(createInit.method).toBe("POST");

    const body = JSON.parse(createInit.body as string);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ custom_id: "row1", url: "https://example.com" });
    expect(body.items[1]).toMatchObject({ custom_id: "row2", url: "https://test.org" });
  });

  // -------------------------------------------------------------------------
  // 2. Creates batch with correct payload (items array structure + options)
  // -------------------------------------------------------------------------

  it("creates batch with the correct payload structure and country option", async () => {
    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: BATCH_CREATED },
      { ok: true, status: 200, body: BATCH_COMPLETED },
      { ok: true, status: 200, body: BATCH_ITEMS_COMPLETED },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_1 },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_2 },
      { ok: true, status: 200, body: BATCH_ITEMS_FAILED },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--country", "US",
      "--poll-seconds", "0.1",
    ]);

    const [, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(createInit.body as string);
    expect(body.country).toBe("US");
    expect(Array.isArray(body.items)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Polls until status = "completed" (in_progress first, then completed)
  // -------------------------------------------------------------------------

  it("polls GET /batches/{id} until status is completed", async () => {
    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: BATCH_CREATED },         // POST /batches
      { ok: true, status: 200, body: BATCH_IN_PROGRESS },     // GET /batches/batch_xyz789 — first poll
      { ok: true, status: 200, body: BATCH_COMPLETED },       // GET /batches/batch_xyz789 — second poll
      { ok: true, status: 200, body: BATCH_ITEMS_COMPLETED }, // GET /batches/{id}/items?status=completed
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_1 },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_2 },
      { ok: true, status: 200, body: BATCH_ITEMS_FAILED },    // GET /batches/{id}/items?status=failed
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--poll-seconds", "0.1",
    ]);

    // Calls: create + poll1 + poll2 + items(completed) + retrieve*2 + items(failed)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);

    const pollUrl1 = (fetchMock.mock.calls[1] as [string, RequestInit])[0];
    const pollUrl2 = (fetchMock.mock.calls[2] as [string, RequestInit])[0];
    expect(pollUrl1).toMatch(/\/batches\/batch_xyz789$/);
    expect(pollUrl2).toMatch(/\/batches\/batch_xyz789$/);
  });

  // -------------------------------------------------------------------------
  // 4. --dry-run prints payload JSON and makes no API calls
  // -------------------------------------------------------------------------

  it("--dry-run prints payload JSON and makes no API calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--dry-run",
    ]);

    expect(fetchMock).not.toHaveBeenCalled();

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].url).toBe("https://example.com");
  });

  // -------------------------------------------------------------------------
  // 5. Output is always JSON (writeOutput is always called)
  // -------------------------------------------------------------------------

  it("writes valid JSON output after a successful batch", async () => {
    stubFetchSequence(
      { ok: true, status: 200, body: BATCH_CREATED },
      { ok: true, status: 200, body: BATCH_COMPLETED },
      { ok: true, status: 200, body: BATCH_ITEMS_COMPLETED },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_1 },
      { ok: true, status: 200, body: RETRIEVE_RESPONSE_2 },
      { ok: true, status: 200, body: BATCH_ITEMS_FAILED },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--poll-seconds", "0.1",
    ]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.batch_id).toBe("batch_xyz789");
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results_count).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // 6. Missing CSV file gives a clear error
  // -------------------------------------------------------------------------

  it("writes a clear error to stderr and calls process.exit when the CSV file does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn());

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
          "node", "cli", "batch-scrape", "/nonexistent/path/missing.csv",
          "--poll-seconds", "0.1",
        ]),
      ).rejects.toThrow(/process\.exit/);

      const stderrOutput = stderrChunks.join("");
      expect(stderrOutput).toMatch(/Cannot read CSV|ENOENT/i);
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  // -------------------------------------------------------------------------
  // 7. --dry-run includes _retrieve_formats in printed payload
  // -------------------------------------------------------------------------

  it("--dry-run payload includes _retrieve_formats from --formats flag", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--formats", "markdown,html",
      "--dry-run",
    ]);

    const output = stdoutChunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed._retrieve_formats).toEqual(["markdown", "html"]);
  });

  // -------------------------------------------------------------------------
  // 8. CSV with 'id' column (alternative to 'custom_id') is accepted
  // -------------------------------------------------------------------------

  it("accepts CSV with 'id' column as an alternative to 'custom_id'", async () => {
    const csvWithId = "id,url\nitem1,https://alt1.com\nitem2,https://alt2.com\n";
    const altCsv = path.join(tmpDir, "alt.csv");
    fs.writeFileSync(altCsv, csvWithId, "utf8");

    const fetchMock = stubFetchSequence(
      { ok: true, status: 200, body: { id: "batch_alt", status: "completed", total_urls: 2, completed_urls: 2 } },
      { ok: true, status: 200, body: { id: "batch_alt", status: "completed", total_urls: 2, completed_urls: 2 } },
      { ok: true, status: 200, body: { items: [], cursor: null } },
      { ok: true, status: 200, body: { items: [], cursor: null } },
    );

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", altCsv,
      "--poll-seconds", "0.1",
    ]);

    const [, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(createInit.body as string);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ custom_id: "item1", url: "https://alt1.com" });
  });

  // -------------------------------------------------------------------------
  // 9. --out flag writes JSON to file instead of stdout
  // -------------------------------------------------------------------------

  it("writes JSON to --out file instead of stdout", async () => {
    stubFetchSequence(
      { ok: true, status: 200, body: BATCH_CREATED },
      { ok: true, status: 200, body: BATCH_COMPLETED },
      { ok: true, status: 200, body: { items: [], cursor: null } },
      { ok: true, status: 200, body: { items: [], cursor: null } },
    );

    const outFile = path.join(tmpDir, "out.json");

    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "batch-scrape", csvFile,
      "--out", outFile,
      "--poll-seconds", "0.1",
    ]);

    expect(stdoutChunks.join("")).toBe("");
    const written = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(written.batch_id).toBe("batch_xyz789");
  });
});
