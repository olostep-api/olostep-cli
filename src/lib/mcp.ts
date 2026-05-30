/**
 * Olostep MCP server install/uninstall logic.
 *
 * Pure logic — no CLI side effects. Mirrors `src/mcp_install.py` in the
 * Python CLI so the two implementations stay in lockstep.
 *
 * Two transports:
 *   - "http"  (default): hosted endpoint, Authorization: Bearer <key>
 *   - "stdio": local install via `npx -y olostep-mcp` with OLOSTEP_API_KEY env
 *
 * Per-agent schema differences (root key, URL field, extra fields) are
 * captured in `agentConfigs()` so the CLI stays one command across all nine
 * supported agents (cursor, claude, windsurf, vscode, kilo, claude-desktop,
 * opencode, continue, codex).
 *
 * Special format flags:
 *   - arrayFormat: agent stores mcpServers as an array; entries are matched by
 *     `name` field rather than object key.
 *   - tomlFormat: agent config is a TOML file (codex). A minimal inline
 *     serialiser/deserialiser handles the `[mcp_servers.olostep]` section.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type Transport = "http" | "stdio";

export const HOSTED_URL = "https://mcp.olostep.com/mcp";
export const NPM_PACKAGE = "olostep-mcp";
export const SERVER_NAME = "olostep";

export interface AgentMcpConfig {
  name: string;
  /** If any of these paths exists, the agent is considered "installed". */
  probePaths: string[];
  /** Default install target (per-user). */
  globalConfig: string;
  /** Project-local install target. `null` = agent has no project-local MCP config. */
  projectConfig: string | null;
  /** JSON key that holds the per-server map (or array when arrayFormat=true). */
  rootKey: string;
  /** Field name for the hosted URL inside the server entry. */
  urlField: string;
  /** Extra fields merged into a hosted-mode entry (e.g. VS Code needs `"type":"http"`). */
  httpExtra: Record<string, unknown>;
  /** Extra fields merged into a stdio-mode entry. */
  stdioExtra: Record<string, unknown>;
  /**
   * When true the config stores mcpServers as an array of objects with a
   * `name` field (e.g. Continue). Install/uninstall match by `name === SERVER_NAME`.
   */
  arrayFormat?: boolean;
  /**
   * When true the config file is TOML, not JSON (e.g. Codex).
   * A minimal inline TOML helper is used instead of JSON.parse/stringify.
   */
  tomlFormat?: boolean;
}

/**
 * Returns the platform-specific base directory for Claude Desktop config.
 * Exported for testability (tests pass a fake `platform` + `home`).
 */
export function claudeDesktopConfigDir(
  platform: NodeJS.Platform,
  home: string,
): string {
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Claude");
  if (platform === "win32") return path.join(home, "AppData", "Roaming", "Claude");
  // Linux and everything else
  return path.join(home, ".config", "Claude");
}

/**
 * Returns the supported agent map. Recomputed each call so tests can
 * override `os.homedir`/`process.cwd`.
 */
export function agentConfigs(): Record<string, AgentMcpConfig> {
  const home = os.homedir();
  const cwd = process.cwd();
  const platform = process.platform;
  const claudeDesktopDir = claudeDesktopConfigDir(platform, home);
  return {
    cursor: {
      name: "cursor",
      probePaths: [path.join(home, ".cursor")],
      globalConfig: path.join(home, ".cursor", "mcp.json"),
      projectConfig: path.join(cwd, ".cursor", "mcp.json"),
      rootKey: "mcpServers",
      urlField: "url",
      httpExtra: {},
      stdioExtra: {},
    },
    claude: {
      name: "claude",
      probePaths: [path.join(home, ".claude"), path.join(home, ".claude.json")],
      globalConfig: path.join(home, ".claude.json"),
      projectConfig: path.join(cwd, ".mcp.json"),
      rootKey: "mcpServers",
      urlField: "url",
      // Claude Code accepts a bare {url, headers} entry, but its own
      // `claude mcp add --transport http` writes an explicit transport type.
      // Including it is strictly safer and matches that tool.
      httpExtra: { type: "http" },
      stdioExtra: { type: "stdio" },
    },
    windsurf: {
      name: "windsurf",
      probePaths: [path.join(home, ".codeium", "windsurf")],
      globalConfig: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
      projectConfig: null,
      rootKey: "mcpServers",
      urlField: "serverUrl",
      httpExtra: {},
      stdioExtra: {},
    },
    vscode: {
      name: "vscode",
      probePaths: [path.join(home, ".vscode"), path.join(home, ".vscode-server")],
      globalConfig: path.join(home, ".vscode", "mcp.json"),
      projectConfig: path.join(cwd, ".vscode", "mcp.json"),
      rootKey: "servers",
      urlField: "url",
      httpExtra: { type: "http" },
      stdioExtra: { type: "stdio" },
    },
    kilo: {
      name: "kilo",
      probePaths: [path.join(home, ".kilocode")],
      globalConfig: path.join(home, ".kilocode", "mcp.json"),
      projectConfig: path.join(cwd, ".kilocode", "mcp.json"),
      rootKey: "mcpServers",
      urlField: "url",
      httpExtra: {},
      stdioExtra: {},
    },
    "claude-desktop": {
      name: "claude-desktop",
      probePaths: [claudeDesktopDir],
      globalConfig: path.join(claudeDesktopDir, "claude_desktop_config.json"),
      projectConfig: null,
      rootKey: "mcpServers",
      urlField: "url",
      httpExtra: {},
      stdioExtra: {},
    },
    opencode: {
      name: "opencode",
      probePaths: [path.join(home, ".config", "opencode")],
      globalConfig: path.join(home, ".config", "opencode", "opencode.json"),
      projectConfig: path.join(cwd, "opencode.json"),
      rootKey: "mcpServers",
      urlField: "url",
      httpExtra: {},
      stdioExtra: {},
    },
    continue: {
      name: "continue",
      probePaths: [path.join(home, ".continue")],
      globalConfig: path.join(home, ".continue", "config.json"),
      projectConfig: null,
      rootKey: "mcpServers",
      urlField: "url",
      httpExtra: { type: "http" },
      stdioExtra: { type: "stdio" },
      arrayFormat: true,
    },
    codex: {
      name: "codex",
      probePaths: [path.join(home, ".codex")],
      globalConfig: path.join(home, ".codex", "config.toml"),
      projectConfig: null,
      rootKey: "mcp_servers",
      urlField: "url",
      httpExtra: {},
      stdioExtra: {},
      tomlFormat: true,
    },
  };
}

export function detectInstalledAgents(): string[] {
  const cfgs = agentConfigs();
  return Object.entries(cfgs)
    .filter(([, cfg]) => cfg.probePaths.some((p) => fs.existsSync(p)))
    .map(([name]) => name);
}

export function resolveTargets(opts: { agents: string[]; allAgents: boolean }): string[] {
  const cfgs = agentConfigs();
  const known = new Set(Object.keys(cfgs));
  if (opts.agents.length > 0) {
    const unknown = opts.agents.filter((a) => !known.has(a));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown agent(s): ${[...unknown].sort().join(", ")}. ` +
          `Supported: ${[...known].sort().join(", ")}.`,
      );
    }
    return [...new Set(opts.agents)].sort();
  }
  if (!opts.allAgents) return [];
  return detectInstalledAgents();
}

export function resolveConfigPath(
  cfg: AgentMcpConfig,
  opts: { globalInstall: boolean },
): string {
  if (opts.globalInstall) return cfg.globalConfig;
  if (cfg.projectConfig === null) {
    throw new Error(
      `${cfg.name} does not support project-local MCP config. ` +
        `Use --global or pick a different agent.`,
    );
  }
  return cfg.projectConfig;
}

export function buildServerEntry(
  cfg: AgentMcpConfig,
  opts: { transport: Transport; apiKey: string },
): Record<string, unknown> {
  if (opts.transport === "http") {
    return {
      [cfg.urlField]: HOSTED_URL,
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      ...cfg.httpExtra,
    };
  }
  if (opts.transport === "stdio") {
    return {
      command: "npx",
      args: ["-y", NPM_PACKAGE],
      env: { OLOSTEP_API_KEY: opts.apiKey },
      ...cfg.stdioExtra,
    };
  }
  throw new Error(`Unknown transport: ${String(opts.transport)}`);
}

/** Strip a leading UTF-8 BOM (0xFEFF) if present. */
function stripBOM(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Read JSON object from `p`. Returns `{}` if the file does not exist or is
 * empty. BOM-safe (Windows editors / PowerShell often write BOM'd configs).
 * Throws on invalid JSON or non-object root.
 */
export function _readJson(p: string): Record<string, unknown> {
  if (!fs.existsSync(p)) return {};
  let text: string;
  try {
    text = stripBOM(fs.readFileSync(p, "utf8"));
  } catch (err: any) {
    throw new Error(`Cannot read ${p}: ${err?.message || err}`);
  }
  if (!text.trim()) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err: any) {
    throw new Error(
      `${p} is not valid JSON (${err?.message || err}). Fix or remove the file and retry.`,
    );
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${p} must contain a JSON object at the root.`);
  }
  return data as Record<string, unknown>;
}

/**
 * Write JSON atomically with a UNIQUE temp filename.
 *
 * Why unique? Some agent config files (notably Claude Code's `~/.claude.json`)
 * hold the user's entire state, not just MCP servers. A crash mid-write must
 * never leave that file truncated — so we write to a unique temp file in the
 * same directory (created via `fs.mkdtempSync`), then `fs.renameSync` it into
 * place, which is atomic on POSIX and Windows when source and target share a
 * filesystem. Unique temp dir per call so two concurrent `olostep mcp` runs
 * can't collide.
 */
export function _writeJson(p: string, data: Record<string, unknown>): void {
  const parent = path.dirname(p);
  fs.mkdirSync(parent, { recursive: true });
  const text = JSON.stringify(data, null, 2) + "\n";
  const tmpDir = fs.mkdtempSync(path.join(parent, `.${path.basename(p)}.`));
  const tmpFile = path.join(tmpDir, "out.json");
  try {
    fs.writeFileSync(tmpFile, text, { encoding: "utf8" });
    fs.renameSync(tmpFile, p);
  } finally {
    // Best-effort cleanup; tmpFile is gone if rename succeeded.
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal TOML helpers for codex config.toml
// Handles the specific shape:
//   [mcp_servers.olostep]
//   type = "http"
//   url = "https://..."
//
//   [mcp_servers.olostep.headers]
//   Authorization = "Bearer ..."
// ---------------------------------------------------------------------------

/**
 * Parse `[mcp_servers.olostep]` and `[mcp_servers.olostep.headers]` sections
 * from a TOML string. Returns the entry as a plain object, or null if absent.
 */
export function _tomlReadOlostepEntry(toml: string): Record<string, unknown> | null {
  const lines = toml.split(/\r?\n/);
  let inMain = false;
  let inHeaders = false;
  let found = false;
  const entry: Record<string, unknown> = {};
  const headers: Record<string, string> = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inMain = line === "[mcp_servers.olostep]";
      inHeaders = line === "[mcp_servers.olostep.headers]";
      if (inMain) found = true;
      continue;
    }
    if (inMain || inHeaders) {
      const m = line.match(/^(\w+)\s*=\s*"(.*)"$/);
      if (m) {
        if (inHeaders) {
          headers[m[1]] = m[2];
        } else {
          entry[m[1]] = m[2];
        }
      }
    }
  }
  if (!found) return null;
  if (Object.keys(headers).length > 0) entry.headers = headers;
  return entry;
}

/**
 * Remove `[mcp_servers.olostep]` and `[mcp_servers.olostep.headers]` sections
 * (plus their key lines) from a TOML string. Returns cleaned string.
 */
export function _tomlRemoveOlostepSection(toml: string): string {
  const lines = toml.split(/\r?\n/);
  const out: string[] = [];
  let skip = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      skip =
        line === "[mcp_servers.olostep]" ||
        line === "[mcp_servers.olostep.headers]";
    }
    if (!skip) out.push(raw);
  }
  // Trim trailing blank lines then add final newline.
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.length > 0 ? out.join("\n") + "\n" : "";
}

/**
 * Serialise the olostep entry into TOML section lines and append/replace in
 * the existing TOML string. Always writes `[mcp_servers.olostep]` at the end.
 */
export function _tomlUpsertOlostepEntry(
  existing: string,
  entry: Record<string, unknown>,
): string {
  // Remove any existing olostep section first.
  const base = _tomlRemoveOlostepSection(existing);
  const parts: string[] = [];

  // Separate headers from scalar fields.
  const headers = entry.headers as Record<string, string> | undefined;
  const scalars = Object.entries(entry).filter(([k]) => k !== "headers");

  parts.push("[mcp_servers.olostep]");
  for (const [k, v] of scalars) {
    parts.push(`${k} = "${String(v)}"`);
  }

  if (headers && Object.keys(headers).length > 0) {
    parts.push("");
    parts.push("[mcp_servers.olostep.headers]");
    for (const [k, v] of Object.entries(headers)) {
      parts.push(`${k} = "${v}"`);
    }
  }

  const section = parts.join("\n") + "\n";
  return base ? base + "\n" + section : section;
}

/**
 * Read a TOML config file for the codex agent. Returns the raw text (or ""
 * if absent) so callers can upsert/remove the olostep section.
 */
export function _readToml(p: string): string {
  if (!fs.existsSync(p)) return "";
  try {
    return fs.readFileSync(p, "utf8");
  } catch (err: any) {
    throw new Error(`Cannot read ${p}: ${err?.message || err}`);
  }
}

/**
 * Write TOML file atomically (same rename trick as `_writeJson`).
 */
export function _writeToml(p: string, content: string): void {
  const parent = path.dirname(p);
  fs.mkdirSync(parent, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(parent, `.${path.basename(p)}.`));
  const tmpFile = path.join(tmpDir, "out.toml");
  try {
    fs.writeFileSync(tmpFile, content, { encoding: "utf8" });
    fs.renameSync(tmpFile, p);
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch { /* ignore */ }
    try {
      fs.rmdirSync(tmpDir);
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------

/** Return a deep copy of `entry` with secrets masked. Safe to print/log. */
export function redact(entry: Record<string, unknown>): Record<string, unknown> {
  const safe = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
  const headers = safe.headers;
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    const h = headers as Record<string, unknown>;
    if (typeof h.Authorization === "string") h.Authorization = "Bearer ****";
  }
  const env = safe.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const e = env as Record<string, unknown>;
    if (typeof e.OLOSTEP_API_KEY === "string") e.OLOSTEP_API_KEY = "****";
  }
  return safe;
}

export type InstallStatus = "installed" | "updated" | "unchanged" | "would-install" | "would-update" | "skipped";

export interface InstallResult {
  agent: string;
  path: string;
  transport: Transport;
  status: InstallStatus;
  entry: Record<string, unknown>;
}

export function installForAgents(opts: {
  agents: string[];
  apiKey: string;
  transport: Transport;
  globalInstall: boolean;
  overwrite: boolean;
  dryRun: boolean;
}): InstallResult[] {
  if (!opts.apiKey) throw new Error("apiKey is required");
  const cfgs = agentConfigs();
  const results: InstallResult[] = [];
  for (const agent of opts.agents) {
    const cfg = cfgs[agent];
    if (!cfg) throw new Error(`Unknown agent: ${agent}`);
    const p = resolveConfigPath(cfg, { globalInstall: opts.globalInstall });
    const entry = buildServerEntry(cfg, { transport: opts.transport, apiKey: opts.apiKey });

    // ------------------------------------------------------------------
    // TOML format (codex)
    // ------------------------------------------------------------------
    if (cfg.tomlFormat) {
      const toml = _readToml(p);
      const existing = _tomlReadOlostepEntry(toml);
      const alreadyPresent = existing !== null;
      if (alreadyPresent && !opts.overwrite) {
        results.push({
          agent,
          path: p,
          transport: opts.transport,
          status: "skipped",
          entry: redact(existing as Record<string, unknown>),
        });
        continue;
      }
      let status: InstallStatus;
      if (opts.dryRun) {
        status = alreadyPresent ? "would-update" : "would-install";
      } else {
        const updated = _tomlUpsertOlostepEntry(toml, entry);
        _writeToml(p, updated);
        status = alreadyPresent ? "updated" : "installed";
      }
      results.push({ agent, path: p, transport: opts.transport, status, entry: redact(entry) });
      continue;
    }

    // ------------------------------------------------------------------
    // Array format (continue)
    // ------------------------------------------------------------------
    if (cfg.arrayFormat) {
      const data = _readJson(p);
      let arr = data[cfg.rootKey];
      if (arr === undefined) {
        arr = [];
        data[cfg.rootKey] = arr;
      }
      if (!Array.isArray(arr)) {
        throw new Error(`${p}: '${cfg.rootKey}' is not a JSON array — refusing to overwrite.`);
      }
      const serverArray = arr as Record<string, unknown>[];
      const existingIdx = serverArray.findIndex(
        (e) => e && typeof e === "object" && !Array.isArray(e) && e.name === SERVER_NAME,
      );
      const alreadyPresent = existingIdx !== -1;
      if (alreadyPresent && !opts.overwrite) {
        results.push({
          agent,
          path: p,
          transport: opts.transport,
          status: "skipped",
          entry: redact(serverArray[existingIdx]),
        });
        continue;
      }
      const arrayEntry = { name: SERVER_NAME, ...entry };
      let status: InstallStatus;
      if (opts.dryRun) {
        status = alreadyPresent ? "would-update" : "would-install";
      } else {
        if (alreadyPresent) {
          serverArray[existingIdx] = arrayEntry;
        } else {
          serverArray.push(arrayEntry);
        }
        _writeJson(p, data);
        status = alreadyPresent ? "updated" : "installed";
      }
      results.push({ agent, path: p, transport: opts.transport, status, entry: redact(arrayEntry) });
      continue;
    }

    // ------------------------------------------------------------------
    // Standard object-map format (all other agents)
    // ------------------------------------------------------------------
    const existing = _readJson(p);
    let servers = existing[cfg.rootKey];
    if (servers === undefined) {
      servers = {};
      existing[cfg.rootKey] = servers;
    }
    if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
      throw new Error(`${p}: '${cfg.rootKey}' is not a JSON object — refusing to overwrite.`);
    }
    const serverMap = servers as Record<string, unknown>;
    const alreadyPresent = Object.prototype.hasOwnProperty.call(serverMap, SERVER_NAME);

    if (alreadyPresent && !opts.overwrite) {
      const current = serverMap[SERVER_NAME];
      results.push({
        agent,
        path: p,
        transport: opts.transport,
        status: "skipped",
        entry:
          current && typeof current === "object" && !Array.isArray(current)
            ? redact(current as Record<string, unknown>)
            : {},
      });
      continue;
    }

    let status: InstallStatus;
    if (opts.dryRun) {
      status = alreadyPresent ? "would-update" : "would-install";
    } else {
      serverMap[SERVER_NAME] = entry;
      _writeJson(p, existing);
      status = alreadyPresent ? "updated" : "installed";
    }
    results.push({
      agent,
      path: p,
      transport: opts.transport,
      status,
      entry: redact(entry),
    });
  }
  return results;
}

export type UninstallStatus = "removed" | "not-present" | "would-remove";

export interface UninstallResult {
  agent: string;
  path: string;
  status: UninstallStatus;
}

export function uninstallForAgents(opts: {
  agents: string[];
  globalInstall: boolean;
  dryRun: boolean;
}): UninstallResult[] {
  const cfgs = agentConfigs();
  const results: UninstallResult[] = [];
  for (const agent of opts.agents) {
    const cfg = cfgs[agent];
    if (!cfg) throw new Error(`Unknown agent: ${agent}`);
    const p = resolveConfigPath(cfg, { globalInstall: opts.globalInstall });
    if (!fs.existsSync(p)) {
      results.push({ agent, path: p, status: "not-present" });
      continue;
    }

    // ------------------------------------------------------------------
    // TOML format (codex)
    // ------------------------------------------------------------------
    if (cfg.tomlFormat) {
      const toml = _readToml(p);
      const existing = _tomlReadOlostepEntry(toml);
      if (existing === null) {
        results.push({ agent, path: p, status: "not-present" });
        continue;
      }
      if (opts.dryRun) {
        results.push({ agent, path: p, status: "would-remove" });
        continue;
      }
      const updated = _tomlRemoveOlostepSection(toml);
      _writeToml(p, updated);
      results.push({ agent, path: p, status: "removed" });
      continue;
    }

    // ------------------------------------------------------------------
    // Array format (continue)
    // ------------------------------------------------------------------
    if (cfg.arrayFormat) {
      const data = _readJson(p);
      const arr = data[cfg.rootKey];
      if (!Array.isArray(arr)) {
        results.push({ agent, path: p, status: "not-present" });
        continue;
      }
      const serverArray = arr as Record<string, unknown>[];
      const existingIdx = serverArray.findIndex(
        (e) => e && typeof e === "object" && !Array.isArray(e) && e.name === SERVER_NAME,
      );
      if (existingIdx === -1) {
        results.push({ agent, path: p, status: "not-present" });
        continue;
      }
      if (opts.dryRun) {
        results.push({ agent, path: p, status: "would-remove" });
        continue;
      }
      serverArray.splice(existingIdx, 1);
      _writeJson(p, data);
      results.push({ agent, path: p, status: "removed" });
      continue;
    }

    // ------------------------------------------------------------------
    // Standard object-map format
    // ------------------------------------------------------------------
    const data = _readJson(p);
    const servers = data[cfg.rootKey];
    if (
      !servers ||
      typeof servers !== "object" ||
      Array.isArray(servers) ||
      !Object.prototype.hasOwnProperty.call(servers, SERVER_NAME)
    ) {
      results.push({ agent, path: p, status: "not-present" });
      continue;
    }
    if (opts.dryRun) {
      results.push({ agent, path: p, status: "would-remove" });
      continue;
    }
    delete (servers as Record<string, unknown>)[SERVER_NAME];
    // Leave the (possibly now empty) root key in place — users may have
    // intentionally created the file with that shape.
    _writeJson(p, data);
    results.push({ agent, path: p, status: "removed" });
  }
  return results;
}

export interface ListResult {
  agent: string;
  path: string;
  present: boolean;
  transport?: string | null;
  entry?: Record<string, unknown>;
  error?: string;
}

function detectTransport(entry: unknown): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const e = entry as Record<string, unknown>;
  if ("command" in e) return "stdio";
  if ("url" in e || "serverUrl" in e) return "http";
  return "unknown";
}

export function listInstalled(opts?: { globalInstall?: boolean }): ListResult[] {
  const globalInstall = opts?.globalInstall ?? true;
  const cfgs = agentConfigs();
  const results: ListResult[] = [];
  for (const [name, cfg] of Object.entries(cfgs)) {
    let p: string;
    try {
      p = resolveConfigPath(cfg, { globalInstall });
    } catch {
      continue; // agent has no config in this scope
    }
    if (!fs.existsSync(p)) {
      results.push({ agent: name, path: p, present: false, transport: null });
      continue;
    }
    try {
      // TOML format (codex)
      if (cfg.tomlFormat) {
        const toml = _readToml(p);
        const entry = _tomlReadOlostepEntry(toml);
        if (entry !== null) {
          results.push({
            agent: name,
            path: p,
            present: true,
            transport: detectTransport(entry),
            entry: redact(entry),
          });
        } else {
          results.push({ agent: name, path: p, present: false, transport: null });
        }
        continue;
      }

      const data = _readJson(p);

      // Array format (continue)
      if (cfg.arrayFormat) {
        const arr = data[cfg.rootKey];
        if (Array.isArray(arr)) {
          const entryRaw = (arr as Record<string, unknown>[]).find(
            (e) => e && typeof e === "object" && !Array.isArray(e) && e.name === SERVER_NAME,
          );
          if (entryRaw) {
            results.push({
              agent: name,
              path: p,
              present: true,
              transport: detectTransport(entryRaw),
              entry: redact(entryRaw),
            });
            continue;
          }
        }
        results.push({ agent: name, path: p, present: false, transport: null });
        continue;
      }

      // Standard object-map format
      const servers = data[cfg.rootKey];
      if (
        servers &&
        typeof servers === "object" &&
        !Array.isArray(servers) &&
        Object.prototype.hasOwnProperty.call(servers, SERVER_NAME)
      ) {
        const entryRaw = (servers as Record<string, unknown>)[SERVER_NAME];
        const entry =
          entryRaw && typeof entryRaw === "object" && !Array.isArray(entryRaw)
            ? (entryRaw as Record<string, unknown>)
            : {};
        results.push({
          agent: name,
          path: p,
          present: true,
          transport: detectTransport(entryRaw),
          entry: redact(entry),
        });
      } else {
        results.push({ agent: name, path: p, present: false, transport: null });
      }
    } catch (err: any) {
      results.push({
        agent: name,
        path: p,
        present: false,
        transport: null,
        error: String(err?.message || err),
      });
    }
  }
  return results;
}
