import { Command } from "commander";

import { api } from "../lib/api-client.js";
import { failWith, loadJsonObject, parseNumberFlag, writeOutput } from "../lib/output.js";

const DEFAULT_HTTP_TIMEOUT_S = 60;

interface BatchUpdateOptions {
  metadataJson?: string;
  metadataFile?: string;
  out?: string;
  timeout: string;
}

/**
 * Normalize metadata values to strings — the Olostep API stores batch
 * metadata as `Dict[str, str]`. Mirrors `normalize_batch_metadata` in the
 * Python CLI: nested dicts/lists are JSON-encoded; nulls become "".
 */
function normalizeMetadata(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = key.trim();
    if (!k) throw new Error("Metadata keys must be non-empty strings.");
    if (value === null || value === undefined) {
      out[k] = "";
      continue;
    }
    if (typeof value === "string") {
      out[k] = value;
      continue;
    }
    if (typeof value === "object") {
      out[k] = JSON.stringify(value);
      continue;
    }
    out[k] = String(value);
  }
  return out;
}

export function registerBatchUpdate(program: Command): void {
  program
    .command("batch-update")
    .description("Update metadata on an existing batch.")
    .argument("<batch_id>", "Batch ID")
    .option("--metadata-json <json>", "Batch metadata JSON object string")
    .option("--metadata-file <path>", "Path to JSON file containing batch metadata object")
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_HTTP_TIMEOUT_S))
    .action(async (batchId: string, opts: BatchUpdateOptions) => {
      try {
        const httpTimeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });

        const raw = loadJsonObject(
          opts.metadataJson,
          opts.metadataFile,
          "--metadata-json",
          "--metadata-file",
        );
        if (!raw) {
          throw new Error("One of --metadata-json or --metadata-file is required.");
        }

        const metadata = normalizeMetadata(raw);
        if (Object.keys(metadata).length === 0) {
          throw new Error("Metadata cannot be empty.");
        }

        const updated = await api.patch<unknown>(
          `/batches/${encodeURIComponent(batchId)}`,
          { metadata },
          { timeoutMs: Math.round(httpTimeoutS * 1000) },
        );
        writeOutput(updated, opts.out);
      } catch (err) {
        failWith(err);
      }
    });
}
