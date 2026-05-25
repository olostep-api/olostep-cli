import { Command } from "commander";

import { api } from "../lib/api-client.js";
import { failWith, parseNumberFlag, writeOutput } from "../lib/output.js";

const DEFAULT_HTTP_TIMEOUT_S = 60;

interface ScrapeGetOptions {
  out?: string;
  timeout: string;
}

export function registerScrapeGet(program: Command): void {
  program
    .command("scrape-get")
    .description("Retrieve the result of a previous scrape by its ID.")
    .argument("<retrieve_id>", "Scrape ID")
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option(
      "--timeout <seconds>",
      "HTTP timeout in seconds",
      String(DEFAULT_HTTP_TIMEOUT_S),
    )
    .action(async (retrieveId: string, opts: ScrapeGetOptions) => {
      try {
        const timeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });
        const result = await api.get<unknown>(
          `/scrapes/${encodeURIComponent(retrieveId)}`,
          { timeoutMs: Math.round(timeoutS * 1000) },
        );
        writeOutput(result, opts.out);
      } catch (err) {
        failWith(err);
      }
    });
}
