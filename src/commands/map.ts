import { Command } from "commander";

import { api } from "../lib/api-client.js";
import {
  failWith,
  parseIntFlag,
  parseNumberFlag,
  writeOutput,
} from "../lib/output.js";

const DEFAULT_HTTP_TIMEOUT_S = 60;

interface MapOptions {
  topN?: string;
  searchQuery?: string;
  includeSubdomain?: boolean;
  includeUrl: string[];
  excludeUrl: string[];
  cursor?: string;
  out?: string;
  timeout: string;
}

export function registerMap(program: Command): void {
  program
    .command("map")
    .description("Discover all URLs on a website.")
    .argument("<url>", "Website URL to map")
    .option("--top-n <n>", "Maximum URLs to return")
    .option("--search-query <q>", "Optional search query to guide URL discovery")
    .option("--include-subdomain", "Include subdomain URLs in map results")
    .option("--no-include-subdomain", "Exclude subdomain URLs")
    .option(
      "--include-url <pattern>",
      "Include only these URL patterns (repeatable)",
      (v: string, prev: string[]) => prev.concat([v]),
      [] as string[],
    )
    .option(
      "--exclude-url <pattern>",
      "Exclude these URL patterns (repeatable)",
      (v: string, prev: string[]) => prev.concat([v]),
      [] as string[],
    )
    .option("--cursor <c>", "Pagination cursor for maps API")
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option(
      "--timeout <seconds>",
      "HTTP timeout in seconds",
      String(DEFAULT_HTTP_TIMEOUT_S),
    )
    .action(async (url: string, opts: MapOptions) => {
      try {
        const timeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });

        let topN: number | undefined;
        if (opts.topN !== undefined) {
          topN = parseIntFlag(opts.topN, "--top-n", { min: 1 });
        }

        const payload: Record<string, unknown> = { url };
        if (opts.searchQuery) payload.search_query = opts.searchQuery;
        if (topN !== undefined) payload.top_n = topN;
        // Commander sets `includeSubdomain` only when the user passed
        // --include-subdomain or --no-include-subdomain; leave unset otherwise.
        if (opts.includeSubdomain !== undefined) {
          payload.include_subdomain = opts.includeSubdomain;
        }
        if (opts.includeUrl && opts.includeUrl.length) {
          payload.include_urls = opts.includeUrl;
        }
        if (opts.excludeUrl && opts.excludeUrl.length) {
          payload.exclude_urls = opts.excludeUrl;
        }
        if (opts.cursor) payload.cursor = opts.cursor;

        const result = await api.post<unknown>("/maps", payload, {
          timeoutMs: Math.round(timeoutS * 1000),
        });
        writeOutput(result, opts.out);
      } catch (err) {
        failWith(err);
      }
    });
}
