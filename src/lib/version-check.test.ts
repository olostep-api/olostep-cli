import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkForUpdate,
  isNewer,
  maybeNotifyUpdate,
  parseVersion,
  scheduleUpdateCheck,
  showPendingUpdateNotice,
} from "./version-check.js";

const CACHE_FILE = path.join(os.tmpdir(), "olostep-cli-version-cache.json");
const NOTICE_FILE = path.join(os.tmpdir(), "olostep-cli-update-notice.json");

function clearCache() {
  try { fs.unlinkSync(CACHE_FILE); } catch { /* ignore */ }
}

describe("parseVersion", () => {
  it("parses a standard semver tuple", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("parses a trailing prerelease suffix", () => {
    expect(parseVersion("10.20.30-beta.1")).toEqual([10, 20, 30]);
  });

  it("tolerates whitespace", () => {
    expect(parseVersion("  4.5.6  ")).toEqual([4, 5, 6]);
  });

  it("returns [0,0,0] for invalid strings", () => {
    expect(parseVersion("not-a-version")).toEqual([0, 0, 0]);
    expect(parseVersion("")).toEqual([0, 0, 0]);
    expect(parseVersion("1.2")).toEqual([0, 0, 0]);
  });
});

describe("isNewer", () => {
  it("returns true when latest > current (patch)", () => {
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  });

  it("returns true when latest > current (minor)", () => {
    expect(isNewer("1.1.0", "1.0.99")).toBe(true);
  });

  it("returns true when latest > current (major)", () => {
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when current > latest", () => {
    expect(isNewer("1.0.0", "1.0.1")).toBe(false);
    expect(isNewer("1.0.0", "2.0.0")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => {
    clearCache();
  });
  afterEach(() => {
    clearCache();
    vi.unstubAllGlobals();
  });

  it("returns null when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("net down"))));
    const result = await checkForUpdate("1.0.0");
    expect(result).toBeNull();
  });

  it("returns the latest version when it is newer than current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: "9.9.9" }),
        } as any),
      ),
    );
    const result = await checkForUpdate("1.0.0");
    expect(result).toBe("9.9.9");
  });

  it("returns null when latest is not newer than current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: "1.0.0" }),
        } as any),
      ),
    );
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });

  it("uses the cached value within 24h instead of re-fetching", async () => {
    // Seed cache with a fresh entry.
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ latest: "5.5.5", checkedAt: Date.now() }),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await checkForUpdate("1.0.0");
    expect(result).toBe("5.5.5");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores stale cache (>24h) and re-fetches", async () => {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ latest: "0.0.1", checkedAt: Date.now() - 25 * 60 * 60 * 1000 }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: "2.0.0" }),
        } as any),
      ),
    );
    const result = await checkForUpdate("1.0.0");
    expect(result).toBe("2.0.0");
  });

  it("returns null when fetch responds non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as any),
      ),
    );
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });
});

describe("maybeNotifyUpdate", () => {
  const ORIGINAL_TTY = (process.stderr as any).isTTY;

  beforeEach(() => {
    clearCache();
    delete process.env.OLOSTEP_NO_UPDATE_NOTICE;
    delete process.env.OLOSTEP_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    (process.stderr as any).isTTY = ORIGINAL_TTY;
    vi.unstubAllGlobals();
    delete process.env.OLOSTEP_NO_UPDATE_NOTICE;
    delete process.env.OLOSTEP_NO_UPDATE_CHECK;
    clearCache();
  });

  it("skips when stderr is not a TTY", async () => {
    (process.stderr as any).isTTY = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await maybeNotifyUpdate("1.0.0");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips when invokedSubcommand === 'update'", async () => {
    (process.stderr as any).isTTY = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await maybeNotifyUpdate("1.0.0", "update");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips when OLOSTEP_NO_UPDATE_NOTICE is set", async () => {
    (process.stderr as any).isTTY = true;
    process.env.OLOSTEP_NO_UPDATE_NOTICE = "1";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await maybeNotifyUpdate("1.0.0");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips when OLOSTEP_NO_UPDATE_CHECK is set", async () => {
    (process.stderr as any).isTTY = true;
    process.env.OLOSTEP_NO_UPDATE_CHECK = "1";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await maybeNotifyUpdate("1.0.0");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("OLOSTEP_NO_UPDATE_NOTICE and OLOSTEP_NO_UPDATE_CHECK are independent", async () => {
    (process.stderr as any).isTTY = true;
    // Only OLOSTEP_NO_UPDATE_CHECK set — should also suppress
    process.env.OLOSTEP_NO_UPDATE_CHECK = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await maybeNotifyUpdate("1.0.0");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never throws on internal errors", async () => {
    (process.stderr as any).isTTY = true;
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("boom"))));
    await expect(maybeNotifyUpdate("1.0.0")).resolves.toBeUndefined();
  });
});

describe("showPendingUpdateNotice", () => {
  const ORIGINAL_TTY = (process.stderr as any).isTTY;

  function clearNotice() {
    try { fs.unlinkSync(NOTICE_FILE); } catch { /* ignore */ }
  }

  function writeNotice(data: object) {
    fs.writeFileSync(NOTICE_FILE, JSON.stringify(data), "utf8");
  }

  beforeEach(() => {
    clearNotice();
    delete process.env.OLOSTEP_NO_UPDATE_NOTICE;
    delete process.env.OLOSTEP_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    (process.stderr as any).isTTY = ORIGINAL_TTY;
    delete process.env.OLOSTEP_NO_UPDATE_NOTICE;
    delete process.env.OLOSTEP_NO_UPDATE_CHECK;
    clearNotice();
  });

  it("prints to stderr when a newer notice file exists", () => {
    (process.stderr as any).isTTY = true;
    writeNotice({ latest: "9.9.9" });
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any) => { chunks.push(String(chunk)); return true; };
    showPendingUpdateNotice("1.0.0");
    process.stderr.write = orig;
    expect(chunks.join("")).toContain("9.9.9");
    expect(fs.existsSync(NOTICE_FILE)).toBe(false);
  });

  it("does nothing when no notice file exists", () => {
    (process.stderr as any).isTTY = true;
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any) => { chunks.push(String(chunk)); return true; };
    showPendingUpdateNotice("1.0.0");
    process.stderr.write = orig;
    expect(chunks).toHaveLength(0);
  });

  it("deletes the notice file even when version is not newer", () => {
    (process.stderr as any).isTTY = true;
    writeNotice({ latest: "0.0.1" });
    showPendingUpdateNotice("1.0.0");
    expect(fs.existsSync(NOTICE_FILE)).toBe(false);
  });

  it("skips when stderr is not a TTY", () => {
    (process.stderr as any).isTTY = false;
    writeNotice({ latest: "9.9.9" });
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any) => { chunks.push(String(chunk)); return true; };
    showPendingUpdateNotice("1.0.0");
    process.stderr.write = orig;
    expect(chunks).toHaveLength(0);
    // Notice file should NOT be deleted when we skip (TTY check)
    expect(fs.existsSync(NOTICE_FILE)).toBe(true);
  });

  it("skips when OLOSTEP_NO_UPDATE_CHECK is set", () => {
    (process.stderr as any).isTTY = true;
    process.env.OLOSTEP_NO_UPDATE_CHECK = "1";
    writeNotice({ latest: "9.9.9" });
    showPendingUpdateNotice("1.0.0");
    expect(fs.existsSync(NOTICE_FILE)).toBe(true);
  });

  it("skips when invokedSubcommand === 'update'", () => {
    (process.stderr as any).isTTY = true;
    writeNotice({ latest: "9.9.9" });
    showPendingUpdateNotice("1.0.0", "update");
    expect(fs.existsSync(NOTICE_FILE)).toBe(true);
  });

  it("never throws on malformed notice file", () => {
    (process.stderr as any).isTTY = true;
    fs.writeFileSync(NOTICE_FILE, "not-json", "utf8");
    expect(() => showPendingUpdateNotice("1.0.0")).not.toThrow();
  });
});

describe("scheduleUpdateCheck", () => {
  function clearNotice() {
    try { fs.unlinkSync(NOTICE_FILE); } catch { /* ignore */ }
  }

  beforeEach(() => {
    clearCache();
    clearNotice();
    delete process.env.OLOSTEP_NO_UPDATE_NOTICE;
    delete process.env.OLOSTEP_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OLOSTEP_NO_UPDATE_NOTICE;
    delete process.env.OLOSTEP_NO_UPDATE_CHECK;
    clearCache();
    clearNotice();
  });

  it("writes a notice file when a newer version is found", async () => {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ latest: "9.9.9", checkedAt: Date.now() }),
    );
    scheduleUpdateCheck("1.0.0");
    // scheduleUpdateCheck is fire-and-forget; wait for the microtask to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(NOTICE_FILE)).toBe(true);
    const data = JSON.parse(fs.readFileSync(NOTICE_FILE, "utf8"));
    expect(data.latest).toBe("9.9.9");
  });

  it("does not write a notice file when already on latest", async () => {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ latest: "1.0.0", checkedAt: Date.now() }),
    );
    scheduleUpdateCheck("1.0.0");
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(NOTICE_FILE)).toBe(false);
  });

  it("skips when OLOSTEP_NO_UPDATE_CHECK is set", async () => {
    process.env.OLOSTEP_NO_UPDATE_CHECK = "1";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    scheduleUpdateCheck("1.0.0");
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(NOTICE_FILE)).toBe(false);
  });

  it("skips when invokedSubcommand === 'update'", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    scheduleUpdateCheck("1.0.0", "update");
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
