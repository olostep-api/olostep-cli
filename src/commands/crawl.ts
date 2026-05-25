import { Command } from "commander";

import { api, OlostepApiError } from "../lib/api-client.js";
import { c, sym } from "../lib/colors.js";
import { failWith, parseCsvList, parseIntFlag, parseNumberFlag, writeOutput } from "../lib/output.js";
import { pollUntil, PollingTimeoutError } from "../lib/polling.js";

const RETRIEVE_FORMATS_ALLOWED = ["markdown", "html", "json"];
const DEFAULT_CRAWL_MAX_PAGES = 50;
const DEFAULT_CRAWL_POLL_SECONDS = 5;
const DEFAULT_CRAWL_POLL_TIMEOUT_S = 900;
const DEFAULT_CRAWL_PAGES_LIMIT = 50;
const DEFAULT_CRAWL_FORMATS = "markdown";
const DEFAULT_HTTP_TIMEOUT_S = 60;

interface CrawlOptions {
  maxPages: string;
  maxDepth?: string;
  includeSubdomain?: boolean;
  includeExternal?: boolean;
  includeUrl?: string[];
  excludeUrl?: string[];
  searchQuery?: string;
  topN?: string;
  followRobotsTxt: boolean;
  webhook?: string;
  formats: string;
  pagesLimit: string;
  pagesSearchQuery?: string;
  pollSeconds: string;
  pollTimeout: string;
  crawlTimeout?: string;
  dryRun?: boolean;
  out?: string;
  timeout: string;
}

interface CrawlObject {
  id?: string;
  crawl_id?: string;
  status?: string;
  [k: string]: unknown;
}

interface PagesPage {
  pages?: Array<Record<string, unknown> & { retrieve_id?: string }>;
  cursor?: number | null;
  [k: string]: unknown;
}

function crawlStatus(o: CrawlObject | undefined): string {
  return String(o?.status || "").toLowerCase();
}

function isCrawlTerminal(o: CrawlObject): boolean {
  return ["completed", "failed", "cancelled", "canceled", "error"].includes(crawlStatus(o));
}

export function registerCrawl(program: Command): void {
  program
    .command("crawl")
    .description("Crawl a website starting from a URL and retrieve page contents.")
    .argument("<url>", "Start URL for crawl")
    .option("--max-pages <n>", "Maximum pages to crawl", String(DEFAULT_CRAWL_MAX_PAGES))
    .option("--max-depth <n>", "Optional maximum crawl depth")
    .option("--include-subdomain", "Include subdomain URLs while crawling")
    .option("--no-include-subdomain", "Do not include subdomain URLs")
    .option("--include-external", "Include external domain URLs while crawling")
    .option(
      "--include-url <pattern>",
      "Include only these URL patterns (repeatable)",
      (val: string, prev: string[] = []) => [...prev, val],
      [] as string[],
    )
    .option(
      "--exclude-url <pattern>",
      "Exclude these URL patterns (repeatable)",
      (val: string, prev: string[] = []) => [...prev, val],
      [] as string[],
    )
    .option("--search-query <q>", "Optional search query for crawl discovery")
    .option("--top-n <n>", "Optional cap on returned pages relevant to search query")
    .option("--follow-robots-txt", "Respect robots.txt rules (omit to use the server default)")
    .option("--ignore-robots-txt", "Ignore robots.txt rules")
    .option("--webhook <url>", "Optional webhook URL")
    .option(
      "--formats <list>",
      'Comma-separated retrieve formats: "markdown,html,json"',
      DEFAULT_CRAWL_FORMATS,
    )
    .option(
      "--pages-limit <n>",
      "Pages API page size (cursor pagination)",
      String(DEFAULT_CRAWL_PAGES_LIMIT),
    )
    .option("--pages-search-query <q>", "Filter query for crawl pages listing")
    .option(
      "--poll-seconds <n>",
      "Crawl status polling interval seconds",
      String(DEFAULT_CRAWL_POLL_SECONDS),
    )
    .option(
      "--poll-timeout <n>",
      "Crawl polling timeout seconds",
      String(DEFAULT_CRAWL_POLL_TIMEOUT_S),
    )
    .option("--crawl-timeout <n>", "Optional crawl timeout in seconds")
    .option("--dry-run", "Print the API payload as JSON and exit without sending it")
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_HTTP_TIMEOUT_S))
    .action(async (url: string, opts: CrawlOptions & { ignoreRobotsTxt?: boolean }) => {
      try {
        const maxPages = parseIntFlag(opts.maxPages, "--max-pages", { min: 1 });
        const maxDepth =
          opts.maxDepth !== undefined
            ? parseIntFlag(opts.maxDepth, "--max-depth", { min: 0 })
            : undefined;
        const topN = opts.topN !== undefined ? parseIntFlag(opts.topN, "--top-n", { min: 1 }) : undefined;
        const pagesLimit = parseIntFlag(opts.pagesLimit, "--pages-limit", { min: 1 });
        const pollSeconds = parseNumberFlag(opts.pollSeconds, "--poll-seconds", { min: 0.1 });
        const pollTimeout = parseNumberFlag(opts.pollTimeout, "--poll-timeout", { min: 1 });
        const crawlTimeout =
          opts.crawlTimeout !== undefined
            ? parseIntFlag(opts.crawlTimeout, "--crawl-timeout", { min: 1 })
            : undefined;
        const httpTimeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });
        const retrieveFormats = parseCsvList(opts.formats, RETRIEVE_FORMATS_ALLOWED);

        // Commander resolves --follow-robots-txt / --ignore-robots-txt into
        // separate boolean fields. Reconcile them into a single tri-state.
        let followRobotsTxt: boolean | undefined;
        if (opts.ignoreRobotsTxt) followRobotsTxt = false;
        else if (opts.followRobotsTxt === false) followRobotsTxt = false;
        else if (opts.followRobotsTxt === true) followRobotsTxt = true;

        const payload: Record<string, unknown> = {
          start_url: url,
          max_pages: maxPages,
        };
        if (maxDepth !== undefined) payload.max_depth = maxDepth;
        if (opts.includeSubdomain !== undefined) payload.include_subdomain = opts.includeSubdomain;
        if (opts.includeExternal !== undefined) payload.include_external = opts.includeExternal;
        if (opts.includeUrl && opts.includeUrl.length > 0) payload.include_urls = opts.includeUrl;
        if (opts.excludeUrl && opts.excludeUrl.length > 0) payload.exclude_urls = opts.excludeUrl;
        if (opts.searchQuery) payload.search_query = opts.searchQuery;
        if (topN !== undefined) payload.top_n = topN;
        if (opts.webhook) payload.webhook = opts.webhook;
        if (crawlTimeout !== undefined) payload.timeout = crawlTimeout;
        if (followRobotsTxt !== undefined) payload.follow_robots_txt = followRobotsTxt;

        if (opts.dryRun) {
          const dry = { ...payload, _retrieve_formats: retrieveFormats };
          writeOutput(dry, opts.out);
          return;
        }

        const httpTimeoutMs = Math.round(httpTimeoutS * 1000);

        process.stderr.write(`${c.dim(sym.dots)} creating crawl...\n`);
        const created = await api.post<CrawlObject>("/crawls", payload, { timeoutMs: httpTimeoutMs });
        const crawlId = String(created.id || created.crawl_id || "");
        if (!crawlId) {
          throw new Error(`Crawl create response missing id: ${JSON.stringify(created)}`);
        }
        process.stderr.write(`${c.green(sym.ok)} crawl created: ${crawlId}\n`);

        let finalCrawl: CrawlObject;
        try {
          finalCrawl = await pollUntil<CrawlObject>(
            () => api.get<CrawlObject>(`/crawls/${encodeURIComponent(crawlId)}`, { timeoutMs: httpTimeoutMs }),
            isCrawlTerminal,
            {
              intervalMs: Math.round(pollSeconds * 1000),
              timeoutMs: Math.round(pollTimeout * 1000),
              onTick: (r, elapsed) => {
                process.stderr.write(
                  `${c.dim(sym.dots)} crawling ${crawlId} [${crawlStatus(r) || "pending"}] ` +
                    `(${Math.round(elapsed / 1000)}s)\n`,
                );
              },
            },
          );
        } catch (err) {
          if (err instanceof PollingTimeoutError) {
            throw new Error(
              `Crawl ${crawlId} still running after ${Math.round((err.elapsedMs || 0) / 1000)}s; ` +
                `check \`/v1/crawls/${crawlId}\` later.`,
            );
          }
          throw err;
        }

        const status = crawlStatus(finalCrawl);
        if (status !== "completed") {
          throw new Error(`Crawl ${crawlId} finished with status=${status}`);
        }

        // List all pages with cursor pagination, retrieving content per page.
        const rows: Array<Record<string, unknown>> = [];
        let cursor: number | undefined = undefined;
        let missingRetrieveId = 0;

        while (true) {
          const qs = new URLSearchParams();
          if (cursor !== undefined) qs.set("cursor", String(cursor));
          qs.set("limit", String(pagesLimit));
          if (opts.pagesSearchQuery) qs.set("search_query", opts.pagesSearchQuery);
          const qsStr = qs.toString();
          const pagePath = `/crawls/${encodeURIComponent(crawlId)}/pages${qsStr ? `?${qsStr}` : ""}`;
          const page = await api.get<PagesPage>(pagePath, { timeoutMs: httpTimeoutMs });
          const pages = page.pages || [];

          for (const p of pages) {
            const retrieveId = p.retrieve_id;
            if (!retrieveId) {
              missingRetrieveId += 1;
              rows.push({ page: p, error: "missing_retrieve_id" });
              continue;
            }
            const retParams = new URLSearchParams();
            retParams.set("retrieve_id", String(retrieveId));
            for (const f of retrieveFormats) retParams.append("formats", f);
            try {
              const retrieved = await api.get<unknown>(`/retrieve?${retParams.toString()}`, {
                timeoutMs: httpTimeoutMs,
              });
              rows.push({ page: p, retrieved });
            } catch (err) {
              const msg = err instanceof OlostepApiError ? err.message : String((err as Error)?.message || err);
              rows.push({ page: p, retrieve_error: msg });
            }
          }

          process.stderr.write(
            `${c.dim(sym.dots)} retrieved ${rows.length} page(s) so far...\n`,
          );

          const nextCursor = page.cursor;
          if (nextCursor === null || nextCursor === undefined) break;
          cursor = Number(nextCursor);
        }

        const output = {
          crawl_id: crawlId,
          crawl: finalCrawl,
          crawl_create: created,
          results_count: rows.length,
          missing_retrieve_id_count: missingRetrieveId,
          results: rows,
        };
        writeOutput(output, opts.out);
      } catch (err) {
        failWith(err);
      }
    });
}
