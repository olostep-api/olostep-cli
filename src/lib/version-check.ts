import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { c } from "./colors.js";

const CACHE_FILE = path.join(os.tmpdir(), "olostep-cli-version-cache.json");
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

/**
 * Prints a one-line "update available" notice to stderr — interactive use only.
 * Suppressed in pipes/CI and when OLOSTEP_NO_UPDATE_NOTICE is set.
 * Never throws.
 */
export async function maybeNotifyUpdate(current: string, invokedSubcommand?: string): Promise<void> {
  if (invokedSubcommand === "update") return;
  if (process.env.OLOSTEP_NO_UPDATE_NOTICE) return;
  try {
    if (!process.stderr.isTTY) return;
  } catch { return; }
  try {
    const latest = await checkForUpdate(current);
    if (latest) {
      process.stderr.write(
        c.yellow(`  ↑ olostep ${latest} is available (you have ${current}) — run \`olostep update\`\n`),
      );
    }
  } catch { /* fail silent */ }
}
