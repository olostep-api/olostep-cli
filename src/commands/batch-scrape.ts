import * as fs from "node:fs";
import * as path from "node:path";

import { Command } from "commander";

import { api, OlostepApiError } from "../lib/api-client.js";
import { c, sym } from "../lib/colors.js";
import { failWith, parseCsvList, parseIntFlag, parseNumberFlag, writeOutput } from "../lib/output.js";
import { pollUntil, PollingTimeoutError } from "../lib/polling.js";

const RETRIEVE_FORMATS_ALLOWED = ["markdown", "html", "json"];
const DEFAULT_BATCH_FORMATS = "markdown";
const DEFAULT_BATCH_POLL_SECONDS = 5;
const DEFAULT_BATCH_LOG_EVERY = 1;
const DEFAULT_BATCH_ITEMS_LIMIT = 50;
const DEFAULT_HTTP_TIMEOUT_S = 60;
// Batch can run a long time — give the poll a generous default cap.
const DEFAULT_BATCH_POLL_TIMEOUT_S = 24 * 60 * 60;

interface BatchScrapeOptions {
  formats: string;
  country?: string;
  parserId?: string;
  pollSeconds: string;
  logEvery: string;
  itemsLimit: string;
  dryRun?: boolean;
  out?: string;
  timeout: string;
}

interface CsvItem {
  custom_id: string;
  url: string;
}

interface BatchObject {
  id?: string;
  status?: string;
  total_urls?: number;
  completed_urls?: number;
  [k: string]: unknown;
}

interface BatchItemsPage {
  items?: Array<Record<string, unknown> & { retrieve_id?: string; custom_id?: string; url?: string }>;
  cursor?: number | null;
  [k: string]: unknown;
}

/**
 * BOM-safe CSV reader for batch input. Accepts columns `custom_id` (or `id`)
 * and `url`. Tolerates extra columns. Skips empty rows.
 */
function readCsvItems(csvPath: string): CsvItem[] {
  let text: string;
  try {
    text = fs.readFileSync(path.resolve(csvPath), "utf8");
  } catch (err: any) {
    throw new Error(`Cannot read CSV ${csvPath}: ${err?.message || err}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Split into lines (handles CRLF/LF). Then parse each line with a tiny
  // quote-aware splitter — Olostep batch CSVs are simple but URLs *can*
  // contain commas inside quoted fields.
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error("CSV is empty. Expected columns: custom_id,url (or id,url)");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  if (header.length === 0) {
    throw new Error("CSV has no header row. Expected columns: custom_id,url (or id,url)");
  }
  const idIdx =
    header.indexOf("custom_id") >= 0 ? header.indexOf("custom_id") : header.indexOf("id");
  const urlIdx = header.indexOf("url");
  if (urlIdx < 0) {
    throw new Error("CSV missing required 'url' column.");
  }

  const items: CsvItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const url = (cols[urlIdx] || "").trim();
    const rid = idIdx >= 0 ? (cols[idIdx] || "").trim() : "";
    if (!url || !rid) continue;
    items.push({ custom_id: rid, url });
  }
  if (items.length === 0) {
    throw new Error(
      "No valid rows found. Ensure CSV has non-empty 'custom_id' (or 'id') and 'url' columns.",
    );
  }
  return items;
}

/** Minimal quote-aware CSV line parser (no embedded newlines). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"' && cur.length === 0) {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function buildBatchPayload(
  items: CsvItem[],
  opts: { country?: string; parserId?: string },
): Record<string, unknown> {
  const normalized = items.map((it) => ({
    url: it.url,
    custom_id: it.custom_id || it.url,
  }));
  const payload: Record<string, unknown> = { items: normalized };
  if (opts.country) payload.country = opts.country;
  if (opts.parserId) payload.parser = { id: opts.parserId };
  return payload;
}

async function listBatchItemsPage(
  batchId: string,
  status: string | undefined,
  cursor: number | undefined,
  limit: number,
  httpTimeoutMs: number,
): Promise<BatchItemsPage> {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (cursor !== undefined) qs.set("cursor", String(cursor));
  qs.set("limit", String(limit));
  const path = `/batches/${encodeURIComponent(batchId)}/items?${qs.toString()}`;
  return api.get<BatchItemsPage>(path, { timeoutMs: httpTimeoutMs });
}

export function registerBatchScrape(program: Command): void {
  program
    .command("batch-scrape")
    .description("Scrape many URLs in parallel from a CSV file.")
    .argument("<csv>", "CSV with columns: custom_id,url (or id,url)")
    .option(
      "--formats <list>",
      'Comma-separated formats: "markdown,html,json"',
      DEFAULT_BATCH_FORMATS,
    )
    .option("--country <code>", "Optional country code (e.g. US, GB, PK)")
    .option("--parser-id <id>", "Optional parser id for structured extraction")
    .option(
      "--poll-seconds <n>",
      "Polling interval seconds",
      String(DEFAULT_BATCH_POLL_SECONDS),
    )
    .option("--log-every <n>", "Log progress every N polls", String(DEFAULT_BATCH_LOG_EVERY))
    .option(
      "--items-limit <n>",
      "Batch items page size (API recommends 10-50)",
      String(DEFAULT_BATCH_ITEMS_LIMIT),
    )
    .option("--dry-run", "Print the API payload as JSON and exit without sending it")
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_HTTP_TIMEOUT_S))
    .action(async (csv: string, opts: BatchScrapeOptions) => {
      try {
        const retrieveFormats = parseCsvList(opts.formats, RETRIEVE_FORMATS_ALLOWED);
        const pollSeconds = parseNumberFlag(opts.pollSeconds, "--poll-seconds", { min: 0.1 });
        const logEvery = parseIntFlag(opts.logEvery, "--log-every", { min: 1 });
        const itemsLimit = parseIntFlag(opts.itemsLimit, "--items-limit", { min: 1 });
        const httpTimeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });
        const httpTimeoutMs = Math.round(httpTimeoutS * 1000);

        const items = readCsvItems(csv);
        const payload = buildBatchPayload(items, {
          country: opts.country,
          parserId: opts.parserId,
        });

        if (opts.dryRun) {
          const dry = { ...payload, _retrieve_formats: retrieveFormats };
          writeOutput(dry, opts.out);
          return;
        }

        process.stderr.write(
          `${c.dim(sym.dots)} creating batch (${items.length} url${items.length === 1 ? "" : "s"})...\n`,
        );
        const created = await api.post<BatchObject>("/batches", payload, {
          timeoutMs: httpTimeoutMs,
        });
        const batchId = String(created.id || "");
        if (!batchId) {
          throw new Error(`Batch create response missing 'id': ${JSON.stringify(created)}`);
        }
        process.stderr.write(`${c.green(sym.ok)} batch created: ${batchId}\n`);

        let tickCount = 0;
        let finalBatch: BatchObject;
        try {
          finalBatch = await pollUntil<BatchObject>(
            () =>
              api.get<BatchObject>(`/batches/${encodeURIComponent(batchId)}`, {
                timeoutMs: httpTimeoutMs,
              }),
            (b) => String(b.status || "").toLowerCase() === "completed",
            {
              intervalMs: Math.round(pollSeconds * 1000),
              timeoutMs: DEFAULT_BATCH_POLL_TIMEOUT_S * 1000,
              onTick: (b) => {
                tickCount += 1;
                if (tickCount % logEvery !== 0) return;
                const total = Number(b.total_urls || 0);
                const done = Number(b.completed_urls || 0);
                const status = String(b.status || "pending");
                process.stderr.write(
                  `${c.dim(sym.dots)} batch ${batchId} [${status}] ${done}/${total || "?"}\n`,
                );
              },
            },
          );
        } catch (err) {
          if (err instanceof PollingTimeoutError) {
            throw new Error(
              `Batch ${batchId} still running after ${Math.round((err.elapsedMs || 0) / 1000)}s; ` +
                `check \`/v1/batches/${batchId}\` later.`,
            );
          }
          throw err;
        }

        const expectedCompleted = Number(finalBatch.completed_urls || 0);

        // Collect results (status=completed) and failures (status=failed).
        const results: Array<Record<string, unknown>> = [];
        let cursor: number | undefined = undefined;
        let sizeExceededCount = 0;
        while (true) {
          const page: BatchItemsPage = await listBatchItemsPage(
            batchId,
            "completed",
            cursor,
            itemsLimit,
            httpTimeoutMs,
          );
          for (const it of page.items || []) {
            const retrieveId = it.retrieve_id;
            const customId = it.custom_id;
            const url = it.url;
            if (!retrieveId) {
              results.push({ custom_id: customId, url, error: "missing_retrieve_id" });
              continue;
            }
            const retParams = new URLSearchParams();
            retParams.set("retrieve_id", String(retrieveId));
            for (const f of retrieveFormats) retParams.append("formats", f);
            try {
              const retrieved = await api.get<Record<string, unknown>>(
                `/retrieve?${retParams.toString()}`,
                { timeoutMs: httpTimeoutMs },
              );
              if (retrieved && retrieved.size_exceeded === true) sizeExceededCount += 1;
              results.push({ custom_id: customId, url, retrieve_id: retrieveId, retrieved });
            } catch (err) {
              const msg = err instanceof OlostepApiError ? err.message : String((err as Error)?.message || err);
              results.push({ custom_id: customId, url, retrieve_id: retrieveId, retrieve_error: msg });
            }
          }
          process.stderr.write(
            `${c.dim(sym.dots)} retrieved ${results.length}/${expectedCompleted || "?"} item(s)...\n`,
          );
          const nextCursor = page.cursor;
          if (nextCursor === null || nextCursor === undefined) break;
          cursor = Number(nextCursor);
        }

        const failedItems: Array<Record<string, unknown>> = [];
        cursor = undefined;
        while (true) {
          const page: BatchItemsPage = await listBatchItemsPage(
            batchId,
            "failed",
            cursor,
            itemsLimit,
            httpTimeoutMs,
          );
          for (const it of page.items || []) failedItems.push(it);
          const nextCursor = page.cursor;
          if (nextCursor === null || nextCursor === undefined) break;
          cursor = Number(nextCursor);
        }

        if (sizeExceededCount > 0) {
          process.stderr.write(
            `${c.yellow(sym.fail)} ${sizeExceededCount} item(s) had size_exceeded=true; ` +
              `content may live in *_hosted_url fields (hosted URLs expire after ~7 days).\n`,
          );
        }

        const output = {
          batch: finalBatch,
          batch_id: batchId,
          requested_count: items.length,
          results_count: results.length,
          results,
          failed_count: failedItems.length,
          failed_items: failedItems,
        };
        writeOutput(output, opts.out);
        process.stderr.write(
          `${c.green(sym.ok)} batch complete: id=${batchId} completed=${results.length} failed=${failedItems.length}\n`,
        );
      } catch (err) {
        failWith(err);
      }
    });
}
