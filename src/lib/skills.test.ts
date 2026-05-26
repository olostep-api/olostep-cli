import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectInstalledAgents, listInstalledSkills, SKILL_FOLDER_PREFIX } from "./skills.js";

let tmpRoot: string;
let canonicalDir: string;
let lockfilePath: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "olostep-skills-test-"));
  canonicalDir = path.join(tmpRoot, "skills");
  lockfilePath = path.join(tmpRoot, ".skill-lock.json");
  fs.mkdirSync(canonicalDir, { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

function writeLockfile(skills: Record<string, any>): void {
  fs.writeFileSync(lockfilePath, JSON.stringify({ version: 1, skills }, null, 2));
}

describe("listInstalledSkills — lockfile prefix filter", () => {
  it("returns only olostep-prefixed entries when the shared lockfile contains foreign ones", () => {
    writeLockfile({
      "olostep-scrape": {
        name: "scrape",
        category: "usage",
        canonicalPath: path.join(canonicalDir, "olostep-scrape"),
        installedAt: "2026-05-26T00:00:00Z",
        updatedAt: "2026-05-26T00:00:00Z",
      },
      "olostep-map": {
        name: "map",
        category: "usage",
        canonicalPath: path.join(canonicalDir, "olostep-map"),
        installedAt: "2026-05-26T00:00:00Z",
        updatedAt: "2026-05-26T00:00:00Z",
      },
      // Simulated foreign entries — left by another CLI sharing the lockfile.
      "firecrawl-scrape": {
        name: "firecrawl-scrape",
        category: "usage",
        canonicalPath: "/whatever",
        installedAt: "2026-05-21T00:00:00Z",
        updatedAt: "2026-05-21T00:00:00Z",
      },
      "competitor-tool": {
        name: "competitor-tool",
        category: "build",
        canonicalPath: "/whatever",
        installedAt: "2026-05-21T00:00:00Z",
        updatedAt: "2026-05-21T00:00:00Z",
      },
    });

    const result = listInstalledSkills({ canonicalDir, lockfilePath });
    const names = result.skills.map((s) => s.folder);
    expect(names).toEqual(["olostep-map", "olostep-scrape"]);
    for (const n of names) expect(n.startsWith(SKILL_FOLDER_PREFIX)).toBe(true);
  });

  it("returns an empty list when the lockfile has only foreign entries", () => {
    writeLockfile({
      "firecrawl-crawl": {
        name: "firecrawl-crawl",
        canonicalPath: "/whatever",
        installedAt: "2026-05-21T00:00:00Z",
      },
    });
    const result = listInstalledSkills({ canonicalDir, lockfilePath });
    expect(result.skills).toEqual([]);
  });

  it("returns an empty list when the lockfile is missing", () => {
    const result = listInstalledSkills({ canonicalDir, lockfilePath });
    expect(result.skills).toEqual([]);
  });

  it("preserves olostep entries even if their canonical path is missing on disk", () => {
    writeLockfile({
      "olostep-scrape": {
        name: "scrape",
        category: "usage",
        canonicalPath: path.join(canonicalDir, "olostep-scrape-MISSING"),
        installedAt: "2026-05-26T00:00:00Z",
      },
    });
    const result = listInstalledSkills({ canonicalDir, lockfilePath });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].folder).toBe("olostep-scrape");
    expect(result.skills[0].canonicalExists).toBe(false);
  });
});

describe("detectInstalledAgents — real vs phantom dirs", () => {
  let fakeHome: string;
  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "olostep-home-test-"));
  });
  afterEach(() => {
    try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("returns no agents when none of the convention dirs exist", () => {
    expect(detectInstalledAgents({ home: fakeHome })).toEqual([]);
  });

  it("detects an agent when its dir has files beyond skills/", () => {
    fs.mkdirSync(path.join(fakeHome, ".cursor", "skills"), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, ".cursor", "argv.json"), "{}");

    expect(detectInstalledAgents({ home: fakeHome })).toContain("cursor");
  });

  it("detects an agent when its dir has only non-skills files", () => {
    fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, ".claude", ".credentials.json"), "{}");

    expect(detectInstalledAgents({ home: fakeHome })).toContain("claude");
  });

  it("rejects a phantom dir whose only contents are skills/", () => {
    fs.mkdirSync(path.join(fakeHome, ".factory", "skills"), { recursive: true });

    expect(detectInstalledAgents({ home: fakeHome })).not.toContain("factory");
  });

  it("rejects a phantom dir even with olostep-* skills inside skills/", () => {
    fs.mkdirSync(path.join(fakeHome, ".roo", "skills", "olostep-scrape"), {
      recursive: true,
    });

    expect(detectInstalledAgents({ home: fakeHome })).not.toContain("roo");
  });

  it("returns multiple real agents and skips phantoms on a mixed machine", () => {
    fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, ".claude", ".credentials.json"), "{}");
    fs.mkdirSync(path.join(fakeHome, ".cursor", "extensions"), { recursive: true });

    fs.mkdirSync(path.join(fakeHome, ".factory", "skills"), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, ".roo", "skills"), { recursive: true });

    const agents = detectInstalledAgents({ home: fakeHome }).sort();
    expect(agents).toEqual(["claude", "cursor"]);
  });

  it("rejects a dir with absolutely nothing in it", () => {
    fs.mkdirSync(path.join(fakeHome, ".gemini"), { recursive: true });
    expect(detectInstalledAgents({ home: fakeHome })).not.toContain("gemini");
  });
});
