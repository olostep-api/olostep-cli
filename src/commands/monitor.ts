import { Command } from "commander";

import { api } from "../lib/api-client.js";
import { failWith, isJsonMode, parseIntFlag, writeOutput } from "../lib/output.js";

const DEFAULT_TIMEOUT_S = 60;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function timeoutMs(opts: { timeout: string }): number {
  return Math.round(parseIntFlag(opts.timeout, "--timeout", { min: 1 }) * 1000);
}

function parseCsvUrls(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

// ---------------------------------------------------------------------------
// Response types (minimal — we surface the raw API shape)
// ---------------------------------------------------------------------------

interface MonitorSchedule { frequency?: string; cron?: string; next_run_at?: string | null }
interface MonitorLastRun { id: string; status: string; change_detected: boolean; ran_at?: string | null }
interface Monitor {
  id: string;
  status: string;
  query: string;
  schedule?: MonitorSchedule | null;
  last_run?: MonitorLastRun | null;
  total_count?: number | null;
  error_message?: string | null;
  [key: string]: unknown;
}
interface MonitorList { monitors: Monitor[]; count: number }
interface MonitorEventsResponse {
  data: Array<{
    id: string; changed?: boolean | null; summary?: string | null;
    ran_at?: string | null; created?: number | null; snapshot_url?: string | null
  }>;
  has_more: boolean;
  next_cursor?: string | null;
  total_count?: number | null;
}

// ---------------------------------------------------------------------------
// Human-readable formatters
// ---------------------------------------------------------------------------

function formatMonitor(m: Monitor): string {
  const lines: string[] = [];
  lines.push(`id:       ${m.id}`);
  lines.push(`status:   ${m.status}`);
  lines.push(`query:    ${m.query}`);
  if (m.schedule?.frequency) lines.push(`freq:     ${m.schedule.frequency}`);
  if (m.schedule?.next_run_at) lines.push(`next run: ${m.schedule.next_run_at}`);
  if (m.last_run) {
    const lr = m.last_run;
    lines.push(`last run: ${lr.id} [${lr.status}] changed=${lr.change_detected}${lr.ran_at ? ` at ${lr.ran_at}` : ""}`);
  }
  if (m.total_count != null) lines.push(`snapshots: ${m.total_count}`);
  if (m.error_message) lines.push(`error:    ${m.error_message}`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function registerMonitorCreate(cmd: Command): void {
  cmd
    .command("create")
    .description("Create a new recurring web monitor from a natural-language query.")
    .argument("<query>", 'What to watch, e.g. "Alert when the pricing page changes"')
    .option("--frequency <freq>", 'How often to run, e.g. "every hour" or "every day at 9am" (min 10 min)')
    .option("--include-urls <urls>", "Comma-separated URLs to monitor")
    .option("--notification-email <email>", "Send email alerts to this address on changes")
    .option("--webhook-url <url>", "POST to this HTTPS URL on each run")
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (query: string, opts) => {
      const ms = timeoutMs(opts);
      try {
        const body: Record<string, unknown> = { query };
        if (opts.frequency) body.frequency = opts.frequency;

        const includeUrls = parseCsvUrls(opts.includeUrls);
        if (includeUrls) body.source_policy = { include_urls: includeUrls };

        if (opts.notificationEmail) {
          body.notification = {
            channels: [{ type: "email", target: opts.notificationEmail }],
          };
        }
        if (opts.webhookUrl) body.webhook = { url: opts.webhookUrl };

        const result = await api.post<Monitor>("/monitors", body, { timeoutMs: ms });

        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }

        process.stdout.write(formatMonitor(result));
      } catch (err) { failWith(err); }
    });
}

function registerMonitorList(cmd: Command): void {
  cmd
    .command("list")
    .description("List all monitors for this API key.")
    .option("--include-deleted", "Include soft-deleted monitors", false)
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (opts) => {
      const ms = timeoutMs(opts);
      try {
        const qs = opts.includeDeleted ? "?include_deleted=true" : "";
        const result = await api.get<MonitorList>(`/monitors${qs}`, { timeoutMs: ms });

        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }

        if (result.monitors.length === 0) {
          process.stdout.write("No monitors found.\n");
          return;
        }
        for (const m of result.monitors) {
          process.stdout.write(formatMonitor(m));
          process.stdout.write("---\n");
        }
        process.stdout.write(`Total: ${result.count}\n`);
      } catch (err) { failWith(err); }
    });
}

function registerMonitorGet(cmd: Command): void {
  cmd
    .command("get")
    .description("Get a single monitor by ID.")
    .argument("<monitor-id>", "Monitor ID (starts with monitor_)")
    .option("--diagram", "Include Mermaid DAG diagram in output", false)
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (monitorId: string, opts) => {
      const ms = timeoutMs(opts);
      try {
        const params = new URLSearchParams();
        if (opts.diagram) params.set("include-diagram", "true");
        const qs = params.toString() ? `?${params}` : "";
        const result = await api.get<Monitor>(`/monitors/${monitorId}${qs}`, { timeoutMs: ms });

        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }
        process.stdout.write(formatMonitor(result));
      } catch (err) { failWith(err); }
    });
}

function registerMonitorPause(cmd: Command): void {
  cmd
    .command("pause")
    .description("Pause a monitor, disabling future scheduled runs.")
    .argument("<monitor-id>", "Monitor ID")
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (monitorId: string, opts) => {
      const ms = timeoutMs(opts);
      try {
        const result = await api.post<Monitor>(`/monitors/${monitorId}/pause`, undefined, { timeoutMs: ms });
        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }
        process.stdout.write(formatMonitor(result));
      } catch (err) { failWith(err); }
    });
}

function registerMonitorResume(cmd: Command): void {
  cmd
    .command("resume")
    .description("Resume a paused monitor, re-enabling scheduled runs.")
    .argument("<monitor-id>", "Monitor ID")
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (monitorId: string, opts) => {
      const ms = timeoutMs(opts);
      try {
        const result = await api.post<Monitor>(`/monitors/${monitorId}/resume`, undefined, { timeoutMs: ms });
        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }
        process.stdout.write(formatMonitor(result));
      } catch (err) { failWith(err); }
    });
}

function registerMonitorDelete(cmd: Command): void {
  cmd
    .command("delete")
    .description("Soft-delete a monitor and remove its schedule and shadow agent.")
    .argument("<monitor-id>", "Monitor ID")
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (monitorId: string, opts) => {
      const ms = timeoutMs(opts);
      try {
        const result = await api.del<Monitor>(`/monitors/${monitorId}`, { timeoutMs: ms });
        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }
        process.stdout.write(formatMonitor(result));
      } catch (err) { failWith(err); }
    });
}

function registerMonitorEvents(cmd: Command): void {
  cmd
    .command("events")
    .description("List snapshot events for a monitor, newest first.")
    .argument("<monitor-id>", "Monitor ID")
    .option("--limit <n>", "Number of events to return (1–100, default 25)")
    .option("--cursor <cursor>", "Pagination cursor from a previous response")
    .option("--json", "Machine-readable JSON output", false)
    .option("--out <path>", "Write JSON to this file instead of stdout", "-")
    .option("--timeout <seconds>", "HTTP timeout in seconds", String(DEFAULT_TIMEOUT_S))
    .action(async (monitorId: string, opts) => {
      const ms = timeoutMs(opts);
      try {
        const params = new URLSearchParams();
        if (opts.limit) {
          const n = parseIntFlag(opts.limit, "--limit", { min: 1 });
          params.set("limit", String(n));
        }
        if (opts.cursor) params.set("cursor", opts.cursor);
        const qs = params.toString() ? `?${params}` : "";

        const result = await api.get<MonitorEventsResponse>(
          `/monitors/${monitorId}/events${qs}`,
          { timeoutMs: ms }
        );

        if (isJsonMode(opts)) { writeOutput(result, opts.out); return; }

        if (result.data.length === 0) {
          process.stdout.write("No events found.\n");
          return;
        }
        for (const ev of result.data) {
          const ts = ev.created ? new Date(ev.created * 1000).toISOString() : "unknown";
          const changed = ev.changed == null ? "?" : ev.changed ? "yes" : "no";
          process.stdout.write(`${ev.id}  changed=${changed}  at=${ts}\n`);
          if (ev.summary) process.stdout.write(`  ${ev.summary}\n`);
        }
        if (result.has_more && result.next_cursor) {
          process.stdout.write(`\nMore events available. Use --cursor ${result.next_cursor}\n`);
        }
        if (result.total_count != null) {
          process.stdout.write(`\nTotal snapshots: ${result.total_count}\n`);
        }
      } catch (err) { failWith(err); }
    });
}

// ---------------------------------------------------------------------------
// Top-level registration
// ---------------------------------------------------------------------------

export function registerMonitor(program: Command): void {
  const monitorCmd = program
    .command("monitor")
    .description("Manage web monitors that watch pages on a schedule and alert on changes.");

  registerMonitorCreate(monitorCmd);
  registerMonitorList(monitorCmd);
  registerMonitorGet(monitorCmd);
  registerMonitorPause(monitorCmd);
  registerMonitorResume(monitorCmd);
  registerMonitorDelete(monitorCmd);
  registerMonitorEvents(monitorCmd);
}
