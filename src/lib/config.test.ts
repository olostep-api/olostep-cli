import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ENV_API_KEY,
  ENV_API_TOKEN,
  ENV_CONFIG_DIR,
  getConfigDir,
  getCredentialsPath,
  loadEnvFile,
  readCredentialsApiKey,
  resolveApiKey,
  writeCredentialsApiKey,
} from "./config.js";

// Snapshot env vars we mutate so each test starts clean.
const SAVED_ENV_KEYS = [
  ENV_API_KEY,
  ENV_API_TOKEN,
  ENV_CONFIG_DIR,
  "OLOSTEP_API_BASE_URL",
  "OLOSTEP_CLI_AUTH_PAGE_URL",
  "OLOSTEP_ENV",
  "ENV",
  "FOO_TEST_KEY",
  "BAR_TEST_KEY",
  "BAZ_TEST_KEY",
  "QUOTED_TEST_KEY",
];
let savedEnv: Record<string, string | undefined> = {};
let tmpDir: string;

beforeEach(() => {
  savedEnv = {};
  for (const k of SAVED_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "olostep-cli-test-"));
  process.env[ENV_CONFIG_DIR] = tmpDir;
});

afterEach(() => {
  for (const k of SAVED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe("getConfigDir", () => {
  it("honors OLOSTEP_CLI_CONFIG_DIR override", () => {
    process.env[ENV_CONFIG_DIR] = tmpDir;
    expect(getConfigDir()).toBe(path.resolve(tmpDir));
  });

  it("resolves a relative override against cwd", () => {
    process.env[ENV_CONFIG_DIR] = "rel/cfg";
    expect(getConfigDir()).toBe(path.resolve("rel/cfg"));
  });

  it("returns a platform-appropriate path when no override is set", () => {
    delete process.env[ENV_CONFIG_DIR];
    const dir = getConfigDir();
    const home = os.homedir();
    expect(dir.startsWith(home)).toBe(true);
    if (process.platform === "darwin") {
      expect(dir).toBe(path.join(home, "Library", "Application Support", "olostep-cli"));
    } else if (process.platform === "win32") {
      expect(dir).toBe(path.join(home, "AppData", "Roaming", "olostep-cli"));
    } else {
      expect(dir).toBe(path.join(home, ".config", "olostep-cli"));
    }
  });

  it("getCredentialsPath joins config dir with credentials.json", () => {
    expect(getCredentialsPath()).toBe(path.join(path.resolve(tmpDir), "credentials.json"));
  });
});

describe("loadEnvFile", () => {
  it("reads simple KEY=value lines", () => {
    const p = path.join(tmpDir, ".env");
    fs.writeFileSync(p, "FOO_TEST_KEY=hello\nBAR_TEST_KEY=world\n");
    loadEnvFile(p);
    expect(process.env.FOO_TEST_KEY).toBe("hello");
    expect(process.env.BAR_TEST_KEY).toBe("world");
  });

  it("does not overwrite existing process env vars", () => {
    process.env.FOO_TEST_KEY = "preset";
    const p = path.join(tmpDir, ".env");
    fs.writeFileSync(p, "FOO_TEST_KEY=fromfile\n");
    loadEnvFile(p);
    expect(process.env.FOO_TEST_KEY).toBe("preset");
  });

  it("strips wrapping single and double quotes", () => {
    const p = path.join(tmpDir, ".env");
    fs.writeFileSync(p, `QUOTED_TEST_KEY="quoted-value"\nBAZ_TEST_KEY='single-quoted'\n`);
    loadEnvFile(p);
    expect(process.env.QUOTED_TEST_KEY).toBe("quoted-value");
    expect(process.env.BAZ_TEST_KEY).toBe("single-quoted");
  });

  it("ignores blank lines and # comments", () => {
    const p = path.join(tmpDir, ".env");
    fs.writeFileSync(p, "\n# this is a comment\nFOO_TEST_KEY=ok\n\n# trailing\n");
    loadEnvFile(p);
    expect(process.env.FOO_TEST_KEY).toBe("ok");
  });

  it("strips a UTF-8 BOM from the start of the file", () => {
    const p = path.join(tmpDir, ".env");
    fs.writeFileSync(p, "﻿FOO_TEST_KEY=bom-stripped\n");
    loadEnvFile(p);
    expect(process.env.FOO_TEST_KEY).toBe("bom-stripped");
  });

  it("is a no-op when the file does not exist", () => {
    expect(() => loadEnvFile(path.join(tmpDir, "missing.env"))).not.toThrow();
  });
});

describe("readCredentialsApiKey / writeCredentialsApiKey", () => {
  it("returns null when the credentials file is missing", () => {
    expect(readCredentialsApiKey()).toBeNull();
  });

  it("reads the api_key field (snake_case)", () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ api_key: "snake-key" }));
    expect(readCredentialsApiKey()).toBe("snake-key");
  });

  it("reads the apiKey field (camelCase)", () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ apiKey: "camel-key" }));
    expect(readCredentialsApiKey()).toBe("camel-key");
  });

  it("returns null for invalid JSON", () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "{not-json");
    expect(readCredentialsApiKey()).toBeNull();
  });

  it("strips a UTF-8 BOM before parsing", () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "﻿" + JSON.stringify({ api_key: "bom-key" }));
    expect(readCredentialsApiKey()).toBe("bom-key");
  });

  it("returns null when api_key is empty or whitespace", () => {
    const p = getCredentialsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ api_key: "   " }));
    expect(readCredentialsApiKey()).toBeNull();
  });

  it("writeCredentialsApiKey writes atomically and round-trips", () => {
    const written = writeCredentialsApiKey("round-trip-key");
    expect(written).toBe(getCredentialsPath());
    expect(fs.existsSync(written)).toBe(true);
    expect(readCredentialsApiKey()).toBe("round-trip-key");
    // No leftover .tmp files from the atomic write.
    const leftovers = fs.readdirSync(path.dirname(written)).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});

describe("resolveApiKey", () => {
  it("prefers an explicit argument over everything else", () => {
    process.env[ENV_API_KEY] = "from-env";
    writeCredentialsApiKey("from-file");
    expect(resolveApiKey("explicit")).toBe("explicit");
  });

  it("falls back to OLOSTEP_API_KEY", () => {
    process.env[ENV_API_KEY] = "key-from-env";
    expect(resolveApiKey()).toBe("key-from-env");
  });

  it("falls back to OLOSTEP_API_TOKEN when OLOSTEP_API_KEY is unset", () => {
    process.env[ENV_API_TOKEN] = "token-from-env";
    expect(resolveApiKey()).toBe("token-from-env");
  });

  it("prefers OLOSTEP_API_KEY over OLOSTEP_API_TOKEN", () => {
    process.env[ENV_API_KEY] = "api-key";
    process.env[ENV_API_TOKEN] = "api-token";
    expect(resolveApiKey()).toBe("api-key");
  });

  it("falls back to credentials.json when env is unset", () => {
    writeCredentialsApiKey("file-key");
    expect(resolveApiKey()).toBe("file-key");
  });

  it("throws a helpful 'Not signed in' error when nothing is configured", () => {
    expect(() => resolveApiKey()).toThrow(/Not signed in/);
    expect(() => resolveApiKey()).toThrow(/olostep init/);
  });
});
