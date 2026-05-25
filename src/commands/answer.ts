import { Command, Option } from "commander";

import { api } from "../lib/api-client.js";
import { failWith, parseNumberFlag, writeOutput } from "../lib/output.js";

const DEFAULT_ANSWER_TIMEOUT_S = 300;

interface AnswerOptions {
  jsonFormat?: string;
  pollInterval?: string;
  pollTimeout?: string;
  out?: string;
  timeout: string;
}

interface AnswerResponse {
  result?: unknown;
  answer_id?: string;
  id?: string;
  answerId?: string;
  [k: string]: unknown;
}

function parseJsonFormat(raw: string | undefined): unknown | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Invalid JSON for --json-format: ${err?.message || err}`);
  }
}

export function registerAnswer(program: Command): void {
  const cmd = program
    .command("answer")
    .description("Ask a question and get a researched answer from the web.")
    .argument("<task>", "Task/question for Olostep Answers")
    .option(
      "--json-format <json>",
      "Optional JSON format/schema (example: '{\"company\":\"\",\"year\":\"\"}')",
    )
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option(
      "--timeout <seconds>",
      "HTTP timeout in seconds (answers endpoint is synchronous, can take ~30-60s)",
      String(DEFAULT_ANSWER_TIMEOUT_S),
    );

  // Hidden legacy flags — accepted as silent no-ops for backwards compat with
  // shell scripts written against the old (incorrectly polling) CLI.
  cmd.addOption(new Option("--poll-interval <seconds>", "Deprecated; ignored").hideHelp());
  cmd.addOption(new Option("--poll-timeout <seconds>", "Deprecated; ignored").hideHelp());

  cmd.action(async (task: string, opts: AnswerOptions) => {
    try {
      const timeoutS = parseNumberFlag(opts.timeout, "--timeout", { min: 0 });
      // Touch the legacy flags so they're consumed and don't trigger
      // commander "unknown option" errors. They have no effect.
      void opts.pollInterval;
      void opts.pollTimeout;

      const jsonFormat = parseJsonFormat(opts.jsonFormat);

      const payload: Record<string, unknown> = { task };
      if (jsonFormat !== undefined) payload.json_format = jsonFormat;

      const created = await api.post<AnswerResponse>("/answers", payload, {
        timeoutMs: Math.round(timeoutS * 1000),
      });

      if (created && typeof created === "object" && (created as AnswerResponse).result) {
        writeOutput(created, opts.out);
        return;
      }

      const answerId =
        (created as AnswerResponse)?.answer_id ||
        (created as AnswerResponse)?.id ||
        (created as AnswerResponse)?.answerId;

      if (!answerId) {
        writeOutput(created, opts.out);
        return;
      }

      // ONE fallback GET — no polling loop. The /v1/answers endpoint is
      // synchronous; this single fetch handles edge cases where the create
      // response omits `result`.
      const fetched = await api.get<unknown>(`/answers/${encodeURIComponent(String(answerId))}`, {
        timeoutMs: Math.round(timeoutS * 1000),
      });
      writeOutput(fetched, opts.out);
    } catch (err) {
      failWith(err);
    }
  });
}
