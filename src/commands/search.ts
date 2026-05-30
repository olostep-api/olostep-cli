import * as fs from "node:fs";
import * as path from "node:path";

import { Command } from "commander";

import { api } from "../lib/api-client.js";
import {
  failWith,
  parseIntFlag,
  parseNumberFlag,
  writeOutput,
} from "../lib/output.js";

const DEFAULT_HTTP_TIMEOUT_S = 60;
const MAX_LIMIT = 25;

interface SearchOptions {
  limit?: string;
  includeDomains?: string;
  excludeDomains?: string;
  json?: boolean;
  out?: string;
  timeout: string;
}

interface SearchLink {
  url: string;
  title: string;
  description?: string;
}

interface SearchResponse {
  id: string;
  result: {
    links: SearchLink[];
  };
}

export function registerSearch(program: Command): void {
  program
    .command("search")
    .description("Search the web and return a ranked list of results.")
    .argument("<query>", "Search query")
    .option("--limit <n>", "Maximum results to return (max 25)")
    .option(
      "--include-domains <domains>",
      "Comma-separated list of domains to include (e.g. wikipedia.org,bbc.com)",
    )
    .option(
      "--exclude-domains <domains>",
      "Comma-separated list of domains to exclude",
    )
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option(
      "--timeout <seconds>",
      "HTTP timeout in seconds",
      String(DEFAULT_HTTP_TIMEOUT_S),
    )
    .action(async (query: string, opts: SearchOptions) => {
      // Validate flags before the API call so Commander propagates the errors.
      const timeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });

      let limit: number | undefined;
      if (opts.limit !== undefined) {
        limit = parseIntFlag(opts.limit, "--limit", { min: 1 });
        if (limit > MAX_LIMIT) {
          throw new Error(`--limit must be <= ${MAX_LIMIT}`);
        }
      }

      try {
        const payload: Record<string, unknown> = { query };
        if (limit !== undefined) payload.limit = limit;

        if (opts.includeDomains) {
          payload.include_domains = opts.includeDomains
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
        }
        if (opts.excludeDomains) {
          payload.exclude_domains = opts.excludeDomains
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
        }

        const result = await api.post<SearchResponse>("/searches", payload, {
          timeoutMs: Math.round(timeoutS * 1000),
        });

        if (opts.json) {
          const links = result?.result?.links ?? [];
          writeOutput({ id: result.id, links }, opts.out);
          return;
        }

        // Human-readable output — also respects --out
        const links = result?.result?.links ?? [];
        let text: string;
        if (links.length === 0) {
          text = "No results found.\n";
        } else {
          const parts: string[] = [];
          for (let i = 0; i < links.length; i++) {
            const { title, url, description } = links[i];
            parts.push(`${i + 1}. ${title}\n`);
            parts.push(`   ${url}\n`);
            if (description) {
              parts.push(`   ${description}\n`);
            }
            parts.push("\n");
          }
          text = parts.join("");
        }

        if (opts.out && opts.out !== "-") {
          const resolved = path.resolve(opts.out);
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, text, { encoding: "utf8" });
        } else {
          process.stdout.write(text);
        }
      } catch (err) {
        failWith(err);
      }
    });
}
