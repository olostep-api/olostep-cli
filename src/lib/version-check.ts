import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { c } from "./colors.js";

const CACHE_FILE = path.join(os.tmpdir(), "olostep-cli-version-cache.json");
const NOTICE_FILE = path.join(os.tmpdir(), "olostep-cli-update-notice.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const REGISTRY_URL = "https://registry.npmjs.org/olostep-cli/latest";

interface CacheShape {
  latest: string;
  checkedAt: number;
}

function readCache(): CacheShape | null {
  try {
    const text = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(text);
    if (typeof parsed?.latest === "string" && typeof parsed?.checkedAt === "number") {
      return parsed as CacheShape;
    }
  } catch { /* ignore */ }
  return null;
}

function writeCache(latest: string): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ latest, checkedAt: Date.now() }), "utf8");
  } catch { /* ignore */ }
}

export function parseVersion(v: string): [number, number, number] {
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

async function fetchLatest(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(REGISTRY_URL, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json();
    const v = (data?.version || "").toString().trim();
    return v || null;
  } catch {
    return null;
  }
}

/**
 * Returns the latest version if newer than `current`, else null.
 * Caches the registry lookup for 24h. Fail-silent on any error.
 */
export async function checkForUpdate(current: string): Promise<string | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return isNewer(cached.latest, current) ? cached.latest : null;
  }
  const latest = await fetchLatest();
  if (!latest) return null;
  writeCache(latest);
  return isNewer(latest, current) ? latest : null;
}

function isSuppressed(subcommand?: string): boolean {
  if (subcommand === "update") return true;
  if (process.env.OLOSTEP_NO_UPDATE_CHECK) return true;
  if (process.env.OLOSTEP_NO_UPDATE_NOTICE) return true;
  return false;
}

/**
 * Shows any pending update notice written by a previous scheduleUpdateCheck call.
 * Call at process start (before the command) so the notice lands before output.
 * Deletes the notice file after reading it. Fail-silent.
 */
export function showPendingUpdateNotice(current: string, invokedSubcommand?: string): void {
  if (isSuppressed(invokedSubcommand)) return;
  try {
    if (!process.stderr.isTTY) return;
  } catch { return; }
  try {
    if (!fs.existsSync(NOTICE_FILE)) return;
    const raw = fs.readFileSync(NOTICE_FILE, "utf8");
    // Delete regardless of whether we can show it.
    try { fs.unlinkSync(NOTICE_FILE); } catch { /* ignore */ }
    const data = JSON.parse(raw);
    const latest = (data?.latest || "").toString().trim();
    if (!latest || !isNewer(latest, current)) return;
    process.stderr.write(
      c.yellow(`  ↑ olostep ${latest} available — run \`olostep update\`\n`),
    );
  } catch { /* fail silent */ }
}

/**
 * Fires a background registry check with no await. If a newer version is found,
 * writes a notice file so showPendingUpdateNotice displays it on the next run.
 * Never blocks the command. Fail-silent.
 */
export function scheduleUpdateCheck(current: string, invokedSubcommand?: string): void {
  if (isSuppressed(invokedSubcommand)) return;
  checkForUpdate(current)
    .then((latest) => {
      if (latest) {
        try {
          fs.writeFileSync(NOTICE_FILE, JSON.stringify({ latest }), "utf8");
        } catch { /* ignore */ }
      }
    })
    .catch(() => { /* ignore */ });
}

/**
 * Legacy combined helper. Kept for tests that import it directly.
 * New code should use showPendingUpdateNotice + scheduleUpdateCheck.
 */
export async function maybeNotifyUpdate(current: string, invokedSubcommand?: string): Promise<void> {
  if (isSuppressed(invokedSubcommand)) return;
  try {
    if (!process.stderr.isTTY) return;
  } catch { return; }
  try {
    const latest = await checkForUpdate(current);
    if (latest) {
      process.stderr.write(
        c.yellow(`  ↑ olostep ${latest} available — run \`olostep update\`\n`),
      );
    }
  } catch { /* fail silent */ }
}
