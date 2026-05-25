import { Command } from "commander";

import { api } from "../lib/api-client.js";
import {
  failWith,
  loadJsonObject,
  parseCsvList,
  parseIntFlag,
  parseNumberFlag,
  writeOutput,
} from "../lib/output.js";

const SCRAPE_FORMATS_ALLOWED = [
  "html",
  "markdown",
  "text",
  "json",
  "raw_pdf",
  "screenshot",
];
const DEFAULT_SCRAPE_FORMATS = "markdown";
const DEFAULT_HTTP_TIMEOUT_S = 60;

interface ScrapeOptions {
  formats: string;
  country?: string;
  waitBeforeScraping?: string;
  payloadJson?: string;
  payloadFile?: string;
  out?: string;
  timeout: string;
}

export function registerScrape(program: Command): void {
  program
    .command("scrape")
    .description("Scrape a single URL and return its content in one or more formats.")
    .argument("<url>", "URL to scrape")
    .option(
      "--formats <list>",
      `Comma-separated formats: "${SCRAPE_FORMATS_ALLOWED.join(",")}"`,
      DEFAULT_SCRAPE_FORMATS,
    )
    .option("--country <code>", "Optional country code (e.g. US, GB)")
    .option(
      "--wait-before-scraping <ms>",
      "Optional wait time before scraping (milliseconds)",
    )
    .option(
      "--payload-json <json>",
      "Optional advanced scrape payload as JSON object string",
    )
    .option(
      "--payload-file <path>",
      "Optional path to a JSON file containing advanced scrape payload object",
    )
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option(
      "--timeout <seconds>",
      "HTTP timeout in seconds",
      String(DEFAULT_HTTP_TIMEOUT_S),
    )
    .action(async (url: string, opts: ScrapeOptions) => {
      try {
        const timeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });
        const formats = parseCsvList(opts.formats, SCRAPE_FORMATS_ALLOWED);

        let waitBeforeScraping: number | undefined;
        if (opts.waitBeforeScraping !== undefined) {
          waitBeforeScraping = parseIntFlag(
            opts.waitBeforeScraping,
            "--wait-before-scraping",
            { min: 0 },
          );
        }

        const payloadObject = loadJsonObject(
          opts.payloadJson,
          opts.payloadFile,
          "--payload-json",
          "--payload-file",
        );

        const payload: Record<string, unknown> = { ...(payloadObject || {}) };
        payload.url_to_scrape = url;
        payload.formats = formats;
        if (opts.country) payload.country = opts.country;
        if (waitBeforeScraping !== undefined) {
          payload.wait_before_scraping = waitBeforeScraping;
        }

        const result = await api.post<unknown>("/scrapes", payload, {
          timeoutMs: Math.round(timeoutS * 1000),
        });
        writeOutput(result, opts.out);
      } catch (err) {
        failWith(err);
      }
    });
}
