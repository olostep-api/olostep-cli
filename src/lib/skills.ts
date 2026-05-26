import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Skills library — pure logic for discovering, installing, removing, and
 * listing Olostep skills. Mirrors the Python reference in
 * D:/Projects/orbit/CLI/src/skills_install.py so that lockfiles, canonical
 * directory layouts, and agent paths remain compatible.
 */

export const SKILL_CATEGORIES = ["usage", "build", "workflow"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export const DEFAULT_SKILL_CATEGORY: SkillCategory = "usage";

export const SKILL_FOLDER_PREFIX = "olostep-";

/** Agent key -> [probe dir under $HOME, skills subdir under $HOME]. */
export const AGENT_MAP: Record<string, [string, string]> = {
  cursor: [".cursor", ".cursor/skills"],
  claude: [".claude", ".claude/skills"],
  codex: [".codex", ".codex/skills"],
  windsurf: [".windsurf", ".windsurf/skills"],
  continue: [".continue", ".continue/skills"],
  augment: [".augment", ".augment/skills"],
  roo: [".roo", ".roo/skills"],
  gemini: [".gemini", ".gemini/skills"],
  copilot: [".copilot", ".copilot/skills"],
  factory: [".factory", ".factory/skills"],
};

export const AGENT_KEYS = Object.keys(AGENT_MAP);

export function defaultCanonicalDir(): string {
  return path.join(os.homedir(), ".agents", "skills");
}

export function defaultLockfilePath(): string {
  return path.join(os.homedir(), ".agents", ".skill-lock.json");
}

export interface SkillEntry {
  name: string;
  sanitizedName: string;
  description: string;
  category: SkillCategory;
  sourceDir: string;
  skillMdPath: string;
}

export interface InstallOptions {
  source?: string;
  canonicalDir?: string;
  lockfilePath?: string;
  agents?: string[];
  allAgents?: boolean;
  globalInstall?: boolean;
  agentSkillsDir?: string;
  only?: string[];
  exclude?: string[];
  category?: string;
  overwrite?: boolean;
  linkMode?: "auto" | "symlink" | "copy";
  dryRun?: boolean;
}

export interface InstalledSkillResult {
  skill: string;
  sanitizedName: string;
  folderName: string;
  category: SkillCategory;
  canonicalPath: string;
  targets: Array<{ agent: string; mode: "symlink" | "copy" | "dry-run"; path: string }>;
}

export interface InstallResult {
  skills: SkillEntry[];
  targets: string[];
  installed: InstalledSkillResult[];
  lockfilePath: string;
  canonicalDir: string;
  dryRun: boolean;
}

export interface RemoveOptions {
  canonicalDir?: string;
  lockfilePath?: string;
  agents?: string[];
  allAgents?: boolean;
  agentSkillsDir?: string;
  only?: string[];
  dryRun?: boolean;
}

export interface RemoveResult {
  removedCanonical: string[];
  removedAgentEntries: Array<{ agent: string; path: string }>;
  targets: string[];
  canonicalDir: string;
  lockfilePath: string;
  dryRun: boolean;
}

export interface ListOptions {
  lockfilePath?: string;
  canonicalDir?: string;
}

export interface ListedSkill {
  folder: string;
  name: string;
  category: SkillCategory;
  canonicalPath: string;
  canonicalExists: boolean;
  targets: Array<{ agent: string; path: string; exists: boolean }>;
  installedAt?: string;
  updatedAt?: string;
}

export interface ListResult {
  lockfilePath: string;
  canonicalDir: string;
  skills: ListedSkill[];
  agents: Record<string, string[]>;
}

// ---------- helpers ----------

function expandUser(p: string): string {
  if (!p) return p;
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function sanitizeName(raw: string): string {
  let clean = raw.trim().toLowerCase().replace(/[^a-zA-Z0-9._-]+/g, "-");
  clean = clean.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  if (!clean) {
    throw new Error(`Invalid skill name: ${JSON.stringify(raw)}`);
  }
  return clean;
}

export function toPrefixedFolderName(raw: string): string {
  const sanitized = sanitizeName(raw);
  if (sanitized.startsWith(SKILL_FOLDER_PREFIX)) return sanitized;
  return `${SKILL_FOLDER_PREFIX}${sanitized}`;
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

export function parseSkillFrontmatter(skillMdPath: string): Record<string, string> {
  const raw = stripBom(fs.readFileSync(skillMdPath, "utf8"));
  // Accept LF or CRLF.
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    throw new Error(`Missing frontmatter in ${skillMdPath}`);
  }
  const startLen = raw.startsWith("---\r\n") ? 5 : 4;
  // Find closing fence on its own line.
  const closeRe = /\r?\n---\r?\n/;
  const m = closeRe.exec(raw.slice(startLen));
  if (!m) {
    throw new Error(`Unterminated frontmatter in ${skillMdPath}`);
  }
  const block = raw.slice(startLen, startLen + m.index).trim();
  const values: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    values[key] = value;
  }
  if (!values.name) {
    throw new Error(`Missing frontmatter field 'name' in ${skillMdPath}`);
  }
  if (!values.description) {
    throw new Error(`Missing frontmatter field 'description' in ${skillMdPath}`);
  }
  return values;
}

/**
 * Locate the bundled `skills/` directory.
 *
 * Resolution: walk up from this module's directory. At each level look for
 * a sibling `skills/` directory next to a `package.json`. This works in
 * both dev (`tsx src/index.ts` → src/lib/) and built (`dist/cli.js` → dist/)
 * modes because the package root holds both.
 */
export function resolveDefaultSkillsSource(startDir?: string): string {
  const start = startDir || __dirname;
  let cur = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(cur, "package.json");
    const sk = path.join(cur, "skills");
    if (fs.existsSync(pkg) && fs.existsSync(sk) && fs.statSync(sk).isDirectory()) {
      return sk;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Last-ditch fallback: <module>/../skills
  return path.resolve(start, "..", "skills");
}

export function discoverSkills(srcDir: string): SkillEntry[] {
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    throw new Error(`Skills source not found: ${srcDir}`);
  }
  const subdirs = fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const entries: SkillEntry[] = [];
  const seen = new Set<string>();
  for (const name of subdirs) {
    const dir = path.join(srcDir, name);
    const md = path.join(dir, "SKILL.md");
    if (!fs.existsSync(md)) continue;
    const fm = parseSkillFrontmatter(md);
    const sanitized = sanitizeName(fm.name);
    if (seen.has(sanitized)) {
      throw new Error(`Duplicate sanitized skill name '${sanitized}' in ${md}`);
    }
    seen.add(sanitized);
    let category = (fm.category || DEFAULT_SKILL_CATEGORY).trim().toLowerCase();
    if (!(SKILL_CATEGORIES as readonly string[]).includes(category)) {
      category = DEFAULT_SKILL_CATEGORY;
    }
    entries.push({
      name: fm.name,
      sanitizedName: sanitized,
      description: fm.description,
      category: category as SkillCategory,
      sourceDir: dir,
      skillMdPath: md,
    });
  }
  if (entries.length === 0) {
    throw new Error(`No valid skills found in ${srcDir}`);
  }
  // Stable order by sanitized name.
  entries.sort((a, b) => a.sanitizedName.localeCompare(b.sanitizedName));
  return entries;
}

export function detectInstalledAgents(): string[] {
  const home = os.homedir();
  const out: string[] = [];
  for (const [agent, [probe]] of Object.entries(AGENT_MAP)) {
    if (fs.existsSync(path.join(home, probe))) out.push(agent);
  }
  return out;
}

function resolveTargets(
  agentSkillsDir: string | undefined,
  agents: string[],
  allAgents: boolean,
): string[] {
  if (agentSkillsDir) return ["custom"];
  if (agents.length) {
    const unknown = agents.filter((a) => !(a in AGENT_MAP));
    if (unknown.length) {
      throw new Error(`Unknown agent(s): ${[...unknown].sort().join(", ")}`);
    }
    return Array.from(new Set(agents)).sort();
  }
  if (!allAgents) return [];
  return detectInstalledAgents();
}

function dirHash(p: string): string {
  const hasher = crypto.createHash("sha256");
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        out.push(...walk(full));
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
    return out;
  };
  const files = walk(p).sort();
  for (const f of files) {
    const rel = path.relative(p, f).split(path.sep).join("/");
    hasher.update(rel);
    hasher.update(fs.readFileSync(f));
  }
  return hasher.digest("hex");
}

function safeReplaceDir(dst: string, overwrite: boolean, dryRun: boolean): void {
  if (!fs.existsSync(dst) && !isSymlink(dst)) return;
  if (!overwrite) {
    throw new Error(`Target exists and overwrite is disabled: ${dst}`);
  }
  if (dryRun) return;
  removePath(dst);
}

function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function removePath(p: string): void {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink() || st.isFile()) {
      fs.unlinkSync(p);
    } else {
      fs.rmSync(p, { recursive: true, force: true });
    }
  } catch (err: any) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}

function copyTree(src: string, dst: string): void {
  fs.cpSync(src, dst, { recursive: true });
}

function installToCanonical(
  skill: SkillEntry,
  canonicalDir: string,
  overwrite: boolean,
  dryRun: boolean,
): string {
  const dst = path.join(canonicalDir, toPrefixedFolderName(skill.sanitizedName));
  safeReplaceDir(dst, overwrite, dryRun);
  if (!dryRun) {
    fs.mkdirSync(canonicalDir, { recursive: true });
    copyTree(skill.sourceDir, dst);
  }
  return dst;
}

function installToAgentDir(
  canonicalSkillDir: string,
  agentSkillsDir: string,
  skillFolderName: string,
  overwrite: boolean,
  dryRun: boolean,
  linkMode: "auto" | "symlink" | "copy",
): "symlink" | "copy" | "dry-run" {
  const dst = path.join(agentSkillsDir, skillFolderName);
  safeReplaceDir(dst, overwrite, dryRun);
  if (dryRun) return "dry-run";
  fs.mkdirSync(agentSkillsDir, { recursive: true });
  if (linkMode === "auto" || linkMode === "symlink") {
    try {
      fs.symlinkSync(path.resolve(canonicalSkillDir), dst, "dir");
      return "symlink";
    } catch (err) {
      if (linkMode === "symlink") throw err;
      // fall through to copy
    }
  }
  copyTree(canonicalSkillDir, dst);
  return "copy";
}

interface LockSkillMeta {
  name?: string;
  category?: string;
  sourceType?: string;
  sourcePath?: string;
  cliLocalPath?: string;
  canonicalPath?: string;
  installedAt?: string;
  updatedAt?: string;
  hash?: string;
  targets?: Array<{ agent: string; path: string; mode: string }>;
}

interface LockFile {
  version: number;
  skills: Record<string, LockSkillMeta>;
}

function loadLockfile(p: string): LockFile {
  if (!fs.existsSync(p)) return { version: 1, skills: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(fs.readFileSync(p, "utf8")));
  } catch {
    return { version: 1, skills: {} };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { version: 1, skills: {} };
  }
  const obj = parsed as Record<string, unknown>;
  const skills = obj.skills && typeof obj.skills === "object" && !Array.isArray(obj.skills)
    ? (obj.skills as Record<string, LockSkillMeta>)
    : {};
  const version = typeof obj.version === "number" ? obj.version : 1;
  return { version, skills };
}

function writeLockfile(p: string, data: LockFile, dryRun: boolean): void {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8" });
}

function targetAgentDir(target: string, agentSkillsDir: string | undefined): string {
  if (target === "custom") {
    if (!agentSkillsDir) {
      throw new Error("agentSkillsDir is required for custom target");
    }
    return expandUser(agentSkillsDir);
  }
  const entry = AGENT_MAP[target];
  if (!entry) throw new Error(`Unknown agent: ${target}`);
  return path.join(os.homedir(), entry[1]);
}

// ---------- install ----------

export function runInstall(opts: InstallOptions): InstallResult {
  const agents = opts.agents ?? [];
  const allAgents = opts.allAgents ?? true;
  const globalInstall = opts.globalInstall ?? true;
  const agentSkillsDir = opts.agentSkillsDir;
  const linkMode = opts.linkMode ?? "auto";
  const overwrite = opts.overwrite ?? true;
  const dryRun = opts.dryRun ?? false;

  // Validation rules from the Python reference.
  if (agents.length && !globalInstall) {
    throw new Error("--agent requires --global");
  }
  if (agentSkillsDir && globalInstall) {
    throw new Error("--agent-skills-dir cannot be combined with --global");
  }
  if (opts.category && !(SKILL_CATEGORIES as readonly string[]).includes(opts.category)) {
    throw new Error("--category must be 'usage', 'build', or 'workflow'");
  }

  const source = expandUser(opts.source ?? resolveDefaultSkillsSource());
  const canonicalDir = expandUser(opts.canonicalDir ?? defaultCanonicalDir());
  const lockfilePath = expandUser(opts.lockfilePath ?? defaultLockfilePath());

  const discovered = discoverSkills(source);

  const include = new Set((opts.only ?? []).map((x) => sanitizeName(x)));
  const exclude = new Set((opts.exclude ?? []).map((x) => sanitizeName(x)));
  const category = opts.category as SkillCategory | undefined;

  const selected = discovered.filter((s) => {
    if (include.size && !include.has(s.sanitizedName)) return false;
    if (exclude.has(s.sanitizedName)) return false;
    if (category && s.category !== category) return false;
    return true;
  });
  if (!selected.length) {
    throw new Error("No skills selected after applying --skill / --exclude / --category filters");
  }

  const targets =
    globalInstall || agentSkillsDir
      ? resolveTargets(agentSkillsDir, agents, allAgents)
      : [];

  const lock = loadLockfile(lockfilePath);

  const installed: InstalledSkillResult[] = [];
  for (const skill of selected) {
    const folderName = toPrefixedFolderName(skill.sanitizedName);
    const canonicalPath = installToCanonical(skill, canonicalDir, overwrite, dryRun);

    const targetResults: InstalledSkillResult["targets"] = [];
    for (const target of targets) {
      const targetDir = targetAgentDir(target, agentSkillsDir);
      const mode = installToAgentDir(
        canonicalPath,
        targetDir,
        folderName,
        overwrite,
        dryRun,
        linkMode,
      );
      targetResults.push({
        agent: target,
        mode,
        path: path.join(targetDir, folderName),
      });
    }

    const now = nowIso();
    const prev = lock.skills[folderName];
    const installedAt = prev?.installedAt || now;
    lock.skills[folderName] = {
      name: skill.name,
      category: skill.category,
      sourceType: "local-plugin-copy",
      sourcePath: source,
      cliLocalPath: skill.sourceDir,
      canonicalPath,
      installedAt,
      updatedAt: now,
      hash: dryRun ? prev?.hash : dirHash(skill.sourceDir),
      targets: targetResults.map((t) => ({ agent: t.agent, path: t.path, mode: t.mode })),
    };

    installed.push({
      skill: skill.name,
      sanitizedName: skill.sanitizedName,
      folderName,
      category: skill.category,
      canonicalPath,
      targets: targetResults,
    });
  }

  writeLockfile(lockfilePath, lock, dryRun);

  return {
    skills: selected,
    targets,
    installed,
    lockfilePath,
    canonicalDir,
    dryRun,
  };
}

// ---------- remove ----------

function iterSkillEntries(baseDir: string, selected: Set<string> | null): string[] {
  if (!fs.existsSync(baseDir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(baseDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
    if (!ent.name.startsWith(SKILL_FOLDER_PREFIX)) continue;
    if (selected && !selected.has(ent.name)) continue;
    out.push(path.join(baseDir, ent.name));
  }
  return out;
}

export function runRemove(opts: RemoveOptions): RemoveResult {
  const agents = opts.agents ?? [];
  const allAgents = opts.allAgents ?? true;
  const agentSkillsDir = opts.agentSkillsDir;
  const dryRun = opts.dryRun ?? false;
  const canonicalDir = expandUser(opts.canonicalDir ?? defaultCanonicalDir());
  const lockfilePath = expandUser(opts.lockfilePath ?? defaultLockfilePath());

  const selectedSet = opts.only && opts.only.length
    ? new Set(opts.only.map((x) => toPrefixedFolderName(x)))
    : null;
  const targets = resolveTargets(agentSkillsDir, agents, allAgents);

  const removedCanonical: string[] = [];
  for (const entry of iterSkillEntries(canonicalDir, selectedSet)) {
    removedCanonical.push(path.basename(entry));
    if (!dryRun) removePath(entry);
  }

  const removedAgentEntries: Array<{ agent: string; path: string }> = [];
  for (const target of targets) {
    const targetDir = targetAgentDir(target, agentSkillsDir);
    for (const entry of iterSkillEntries(targetDir, selectedSet)) {
      // Safety belt: only ever touch olostep-prefixed folders.
      if (!path.basename(entry).startsWith(SKILL_FOLDER_PREFIX)) continue;
      removedAgentEntries.push({ agent: target, path: entry });
      if (!dryRun) removePath(entry);
    }
  }

  const lock = loadLockfile(lockfilePath);
  for (const folder of Object.keys(lock.skills)) {
    if (!folder.startsWith(SKILL_FOLDER_PREFIX)) continue;
    if (selectedSet && !selectedSet.has(folder)) continue;
    delete lock.skills[folder];
  }
  writeLockfile(lockfilePath, lock, dryRun);

  return {
    removedCanonical,
    removedAgentEntries,
    targets,
    canonicalDir,
    lockfilePath,
    dryRun,
  };
}

// ---------- list ----------

export function listInstalledSkills(opts: ListOptions = {}): ListResult {
  const lockfilePath = expandUser(opts.lockfilePath ?? defaultLockfilePath());
  const canonicalDir = expandUser(opts.canonicalDir ?? defaultCanonicalDir());
  const lock = loadLockfile(lockfilePath);

  const home = os.homedir();
  const skills: ListedSkill[] = [];
  for (const folder of Object.keys(lock.skills).sort()) {
    // The lockfile at ~/.agents/.skill-lock.json is a shared file —
    // any other CLI that follows the agent-skills convention can have
    // entries here. We only list the skills WE manage.
    if (!folder.startsWith(SKILL_FOLDER_PREFIX)) continue;
    const meta = lock.skills[folder];
    if (!meta || typeof meta !== "object") continue;
    const canonicalPath = String(meta.canonicalPath || "");
    const exists = !!canonicalPath && (fs.existsSync(canonicalPath) || isSymlink(canonicalPath));
    let category = (meta.category || DEFAULT_SKILL_CATEGORY) as SkillCategory;
    if (!(SKILL_CATEGORIES as readonly string[]).includes(category)) {
      category = DEFAULT_SKILL_CATEGORY;
    }
    // Resolve target install paths from agent dirs.
    const targets: ListedSkill["targets"] = [];
    for (const [agent, [, sub]] of Object.entries(AGENT_MAP)) {
      const tp = path.join(home, sub, folder);
      const tExists = fs.existsSync(tp) || isSymlink(tp);
      if (tExists) targets.push({ agent, path: tp, exists: true });
    }
    skills.push({
      folder,
      name: meta.name || folder,
      category,
      canonicalPath,
      canonicalExists: exists,
      targets,
      installedAt: meta.installedAt,
      updatedAt: meta.updatedAt,
    });
  }

  const agents: Record<string, string[]> = {};
  for (const [agent, [, sub]] of Object.entries(AGENT_MAP)) {
    const agentDir = path.join(home, sub);
    if (!fs.existsSync(agentDir)) continue;
    const installed = fs
      .readdirSync(agentDir, { withFileTypes: true })
      .filter(
        (d) =>
          (d.isDirectory() || d.isSymbolicLink()) && d.name.startsWith(SKILL_FOLDER_PREFIX),
      )
      .map((d) => d.name)
      .sort();
    if (installed.length) agents[agent] = installed;
  }

  return { lockfilePath, canonicalDir, skills, agents };
}
