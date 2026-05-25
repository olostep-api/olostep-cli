import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Shared output helper for API commands. Writes JSON to stdout (or `-`)
 * pretty-printed, or atomically to a file via unique temp-name + rename.
 */
export function writeOutput(data: unknown, outPath?: string): void {
  const payload = JSON.stringify(data, null, 2) + "\n";
  if (!outPath || outPath === "-") {
    process.stdout.write(payload);
    return;
  }
  const resolved = path.resolve(outPath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, payload, { encoding: "utf8" });
    fs.renameSync(tmp, resolved);
  } finally {
    if (fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }
}

/**
 * Parse a comma-separated list of values: trim, lowercase, drop empties,
 * and optionally validate against `allowed`. Throws on invalid values.
 */
export function parseCsvList(raw: string, allowed?: string[]): string[] {
  const values = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
  if (values.length === 0) {
    if (allowed && allowed.length) {
      throw new Error(
        `At least one value is required. Allowed: ${allowed.join(", ")}.`,
      );
    }
    throw new Error("At least one value is required.");
  }
  if (allowed && allowed.length) {
    const allowedSet = new Set(allowed.map((a) => a.toLowerCase()));
    const invalid = values.filter((v) => !allowedSet.has(v));
    if (invalid.length) {
      throw new Error(
        `Invalid value(s): ${invalid.join(", ")}. Allowed: ${allowed.join(", ")}.`,
      );
    }
  }
  return values;
}

/**
 * Read and parse a JSON object from either a raw string or a file path.
 * Exactly one of `raw`/`filePath` may be set (caller-enforced). Returns
 * `undefined` if both are null. Throws on invalid JSON or non-object.
 */
export function loadJsonObject(
  raw: string | undefined,
  filePath: string | undefined,
  jsonFlag: string,
  fileFlag: string,
): Record<string, unknown> | undefined {
  if (raw !== undefined && filePath !== undefined) {
    throw new Error(`Use only one of ${jsonFlag} or ${fileFlag}.`);
  }
  if (raw === undefined && filePath === undefined) return undefined;

  let text: string;
  let hint: string;
  if (filePath !== undefined) {
    hint = fileFlag;
    try {
      text = fs.readFileSync(path.resolve(filePath), "utf8");
      // strip BOM
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    } catch (err: any) {
      throw new Error(`Cannot read ${fileFlag} file ${filePath}: ${err?.message || err}`);
    }
  } else {
    hint = jsonFlag;
    text = raw as string;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text || "");
  } catch (err: any) {
    throw new Error(`Invalid JSON for ${hint}: ${err?.message || err}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${hint} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Standard error path for commands: write to stderr and exit 1. Any
 * thrown Error message flows through verbatim.
 */
export function failWith(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

/**
 * Parse a positive integer CLI flag value, throwing a clear error.
 */
export function parseIntFlag(raw: string, flag: string, opts: { min?: number } = {}): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${flag} must be an integer, got: ${raw}`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`${flag} must be >= ${opts.min}`);
  }
  return n;
}

/**
 * Parse a positive number (float) CLI flag value.
 */
export function parseNumberFlag(raw: string, flag: string, opts: { min?: number } = {}): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${flag} must be a number, got: ${raw}`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`${flag} must be >= ${opts.min}`);
  }
  return n;
}
