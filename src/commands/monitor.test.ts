import { Command } from "commander";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerMonitor } from "./monitor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerMonitor(program);
  return program;
}

const MONITOR_FIXTURE = {
  id: "monitor_abc1234567",
  object: "monitor",
  status: "provisioning",
  query: "Watch the Stripe status page for incidents",
  schedule: { frequency: "every hour", cron: "0 * * * ? *", timezone: "UTC", next_run_at: null },
  notification: null,
  webhook: null,
  last_run: null,
  total_count: null,
  created: 1760327323,
  updated: 1760327323,
};

const MONITOR_LIST_FIXTURE = { monitors: [MONITOR_FIXTURE], count: 1 };

const MONITOR_EVENTS_FIXTURE = {
  data: [
    { id: "run_xyz789", changed: false, summary: "No changes detected.", created: 1760327323 },
  ],
  has_more: false,
  next_cursor: null,
  total_count: 5,
};

function stubFetch(response: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((): Promise<any> =>
      Promise.resolve({
        ok,
        status,
        statusText: ok ? "OK" : "Error",
        text: (): Promise<string> => Promise.resolve(JSON.stringify(response)),
      })
    )
  );
}

function stubEnv(): void {
  process.env["OLOSTEP_API_KEY"] = "olostep_test_key";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("monitor create", () => {
  beforeEach(stubEnv);
  afterEach(() => { vi.unstubAllGlobals(); delete process.env["OLOSTEP_API_KEY"]; });

  it("sends correct payload for minimal create", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "create", "Watch Stripe status page"]);
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain("/monitors");
    const body = JSON.parse(call[1].body);
    expect(body.query).toBe("Watch Stripe status page");
    expect(body.frequency).toBeUndefined();
  });

  it("includes frequency when provided", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "monitor", "create", "Watch Stripe status page",
      "--frequency", "every day at 9am",
    ]);
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.frequency).toBe("every day at 9am");
  });

  it("includes source_policy when --include-urls is given", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "monitor", "create", "Watch Stripe",
      "--include-urls", "https://stripe.com/pricing,https://stripe.com/docs",
    ]);
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.source_policy.include_urls).toHaveLength(2);
    expect(body.source_policy.include_urls[0]).toBe("https://stripe.com/pricing");
  });

  it("includes notification when --notification-email is given", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "monitor", "create", "Watch Stripe",
      "--notification-email", "you@example.com",
    ]);
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.notification.channels[0].type).toBe("email");
    expect(body.notification.channels[0].target).toBe("you@example.com");
  });

  it("outputs JSON with --json", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s: any) => { writes.push(String(s)); return true; });
    await program.parseAsync(["node", "cli", "monitor", "create", "test", "--json"]);
    const combined = writes.join("");
    const parsed = JSON.parse(combined);
    expect(parsed.id).toBe("monitor_abc1234567");
  });
});

describe("monitor list", () => {
  beforeEach(stubEnv);
  afterEach(() => { vi.unstubAllGlobals(); delete process.env["OLOSTEP_API_KEY"]; });

  it("calls GET /monitors", async () => {
    stubFetch(MONITOR_LIST_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "list"]);
    expect((fetch as any).mock.calls[0][0]).toContain("/monitors");
    expect((fetch as any).mock.calls[0][1].method).toBe("GET");
  });

  it("adds include_deleted param when flag is set", async () => {
    stubFetch(MONITOR_LIST_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "list", "--include-deleted"]);
    expect((fetch as any).mock.calls[0][0]).toContain("include_deleted=true");
  });
});

describe("monitor get", () => {
  beforeEach(stubEnv);
  afterEach(() => { vi.unstubAllGlobals(); delete process.env["OLOSTEP_API_KEY"]; });

  it("calls GET /monitors/{id}", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "get", "monitor_abc1234567"]);
    expect((fetch as any).mock.calls[0][0]).toContain("/monitors/monitor_abc1234567");
  });
});

describe("monitor pause/resume/delete", () => {
  beforeEach(stubEnv);
  afterEach(() => { vi.unstubAllGlobals(); delete process.env["OLOSTEP_API_KEY"]; });

  it("pause calls POST /monitors/{id}/pause", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "pause", "monitor_abc1234567"]);
    expect((fetch as any).mock.calls[0][0]).toContain("/monitors/monitor_abc1234567/pause");
    expect((fetch as any).mock.calls[0][1].method).toBe("POST");
  });

  it("resume calls POST /monitors/{id}/resume", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "resume", "monitor_abc1234567"]);
    expect((fetch as any).mock.calls[0][0]).toContain("/monitors/monitor_abc1234567/resume");
    expect((fetch as any).mock.calls[0][1].method).toBe("POST");
  });

  it("delete calls DELETE /monitors/{id}", async () => {
    stubFetch(MONITOR_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "delete", "monitor_abc1234567"]);
    expect((fetch as any).mock.calls[0][0]).toContain("/monitors/monitor_abc1234567");
    expect((fetch as any).mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("monitor events", () => {
  beforeEach(stubEnv);
  afterEach(() => { vi.unstubAllGlobals(); delete process.env["OLOSTEP_API_KEY"]; });

  it("calls GET /monitors/{id}/events", async () => {
    stubFetch(MONITOR_EVENTS_FIXTURE);
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "monitor", "events", "monitor_abc1234567"]);
    expect((fetch as any).mock.calls[0][0]).toContain("/monitors/monitor_abc1234567/events");
    expect((fetch as any).mock.calls[0][1].method).toBe("GET");
  });

  it("passes limit and cursor", async () => {
    stubFetch(MONITOR_EVENTS_FIXTURE);
    const program = makeProgram();
    await program.parseAsync([
      "node", "cli", "monitor", "events", "monitor_abc1234567",
      "--limit", "10", "--cursor", "abc123",
    ]);
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain("limit=10");
    expect(url).toContain("cursor=abc123");
  });
});
