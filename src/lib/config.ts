import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const API_BASE_URL = "https://api.olostep.com/v1";
export const CLI_AUTH_API_BASE = "https://api.olostep.com/v1";
export const CLI_AUTH_PAGE_URL = "https://www.olostep.com/cli-auth";
export const CLI_AUTH_PAGE_URL_DEV = "http://localhost:1660/cli-auth";

export const ENV_API_KEY = "OLOSTEP_API_KEY";
export const ENV_API_TOKEN = "OLOSTEP_API_TOKEN";
export const ENV_API_BASE = "OLOSTEP_API_BASE_URL";
export const ENV_CLI_AUTH_PAGE = "OLOSTEP_CLI_AUTH_PAGE_URL";
export const ENV_CONFIG_DIR = "OLOSTEP_CLI_CONFIG_DIR";
export const ENV_OLOSTEP_ENV = "OLOSTEP_ENV";

export const CREDENTIALS_FILE = "credentials.json";

/**
 * Per-user config directory. Matches the Python CLI exactly so existing
 * credentials.json files keep working:
 *   - macOS:   ~/Library/Application Support/olostep-cli
 *   - Windows: ~/AppData/Roaming/olostep-cli
 *   - Linux:   ~/.config/olostep-cli
 * Override with OLOSTEP_CLI_CONFIG_DIR.
 */
export function getConfigDir(): string {
  const override = (process.env[ENV_CONFIG_DIR] || "").trim();
  if (override) return path.resolve(override);
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "olostep-cli");
  }
  if (process.platform === "win32") {
    return path.join(home, "AppData", "Roaming", "olostep-cli");
  }
  return path.join(home, ".config", "olostep-cli");
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), CREDENTIALS_FILE);
}

function stripBOM(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function stripQuotes(v: string): string {
  v = v.trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
    return v.slice(1, -1);
  }
  return v;
}

function isPlaceholder(v: string): boolean {
  v = v.trim();
  return v.startsWith("<") && v.endsWith(">");
}

/**
 * Lightweight .env reader. Existing process env vars win over file values
 * (`setdefault` semantics — matches the Python CLI).
 */
export function loadEnvFile(envPath: string = path.join(process.cwd(), ".env")): void {
  if (!fs.existsSync(envPath)) return;
  let text: string;
  try {
    text = stripBOM(fs.readFileSync(envPath, "utf8"));
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue; // existing env wins
    process.env[key] = stripQuotes(line.slice(eq + 1));
  }
}

export function readCredentialsApiKey(p?: string): string | null {
  const file = p || getCredentialsPath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(stripBOM(fs.readFileSync(file, "utf8")));
    if (!data || typeof data !== "object") return null;
    const v = (data.api_key || data.apiKey || "").toString().trim();
    return v || null;
  } catch {
    return null;
  }
}

export function writeCredentialsApiKey(apiKey: string): string {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = getCredentialsPath();
  const payload = JSON.stringify({ api_key: apiKey }, null, 2) + "\n";
  // Atomic write — unique temp name to avoid concurrent-run collisions.
  const tmp = path.join(dir, `.${CREDENTIALS_FILE}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, payload, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }
  return filePath;
}

/**
 * API key resolution order (matches Python CLI):
 *   1. explicit arg
 *   2. OLOSTEP_API_KEY env var
 *   3. OLOSTEP_API_TOKEN env var
 *   4. .env file (loaded into env, so collapses into 2/3)
 *   5. credentials.json
 */
export function resolveApiKey(explicit?: string): string {
  loadEnvFile();
  const key = (explicit || process.env[ENV_API_KEY] || process.env[ENV_API_TOKEN] || "").trim();
  if (key) return key;
  const cred = readCredentialsApiKey();
  if (cred) return cred;
  throw new Error(
    "Not signed in. Run `olostep init` to sign in and set up skills + the " +
      "MCP server, or `olostep login` to just sign in. You can also set " +
      `${ENV_API_KEY} / ${ENV_API_TOKEN} or add a project \`.env\`.`,
  );
}

export function isAuthenticated(): boolean {
  try {
    return !!resolveApiKey();
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  return (process.env[ENV_API_BASE] || API_BASE_URL).trim().replace(/\/+$/, "");
}

export function getCliAuthPageUrl(): string {
  const fromEnv = (process.env[ENV_CLI_AUTH_PAGE] || "").trim();
  if (fromEnv && !isPlaceholder(fromEnv)) return fromEnv.replace(/\/+$/, "");
  const mode = (process.env[ENV_OLOSTEP_ENV] || process.env.ENV || "").trim().toLowerCase();
  if (mode === "development" || mode === "dev" || mode === "local") {
    return CLI_AUTH_PAGE_URL_DEV;
  }
  return CLI_AUTH_PAGE_URL;
}
