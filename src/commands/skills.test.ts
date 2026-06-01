import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerSkills } from "./skills.js";
import * as addSkillsModule from "./add-skills.js";
import * as listSkillsModule from "./list-skills.js";
import * as removeSkillsModule from "./remove-skills.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit from killing vitest
  registerSkills(program);
  return program;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("skills command aliases", () => {
  beforeEach(() => {
    vi.spyOn(addSkillsModule, "addSkillsAction").mockResolvedValue(undefined);
    vi.spyOn(listSkillsModule, "listSkillsAction").mockResolvedValue(undefined);
    vi.spyOn(removeSkillsModule, "removeSkillsAction").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("skills install", () => {
    it("exists and delegates to addSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "install"]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts).toBeDefined();
    });

    it("passes --no-global to addSkillsAction correctly", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "install", "--no-global"]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts.global).toBe(false);
    });

    it("passes --global to addSkillsAction correctly", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "install", "--global"]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts.global).toBe(true);
    });

    it("passes --skill option to addSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync([
        "node", "cli", "skills", "install",
        "--skill", "scrape",
        "--skill", "map",
      ]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts.skill).toEqual(["scrape", "map"]);
    });

    it("passes --login option to addSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "install", "--login"]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts.login).toBe(true);
    });
  });

  describe("skills list", () => {
    it("exists and delegates to listSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "list"]);

      expect(listSkillsModule.listSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(listSkillsModule.listSkillsAction).mock.calls[0][0];
      expect(opts).toBeDefined();
    });

    it("passes --json option to listSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "list", "--json"]);

      expect(listSkillsModule.listSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(listSkillsModule.listSkillsAction).mock.calls[0][0];
      expect(opts.json).toBe(true);
    });
  });

  describe("skills uninstall", () => {
    it("exists and delegates to removeSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "uninstall"]);

      expect(removeSkillsModule.removeSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(removeSkillsModule.removeSkillsAction).mock.calls[0][0];
      expect(opts).toBeDefined();
    });

    it("passes --skill option to removeSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync([
        "node", "cli", "skills", "uninstall",
        "--skill", "scrape",
      ]);

      expect(removeSkillsModule.removeSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(removeSkillsModule.removeSkillsAction).mock.calls[0][0];
      expect(opts.skill).toEqual(["scrape"]);
    });

    it("passes --dry-run option to removeSkillsAction", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "uninstall", "--dry-run"]);

      expect(removeSkillsModule.removeSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(removeSkillsModule.removeSkillsAction).mock.calls[0][0];
      expect(opts.dryRun).toBe(true);
    });
  });

  describe("skills update", () => {
    it("exists and delegates to addSkillsAction with overwrite: true", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "update"]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts.overwrite).toBe(true);
    });

    it("forces overwrite: true even when --no-overwrite is not passed", async () => {
      const program = makeProgram();
      await program.parseAsync(["node", "cli", "skills", "update"]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      // overwrite should be true regardless of defaults
      expect(opts.overwrite).toBe(true);
    });

    it("passes other options to addSkillsAction alongside overwrite: true", async () => {
      const program = makeProgram();
      await program.parseAsync([
        "node", "cli", "skills", "update",
        "--skill", "map",
        "--no-global",
      ]);

      expect(addSkillsModule.addSkillsAction).toHaveBeenCalledOnce();
      const opts = vi.mocked(addSkillsModule.addSkillsAction).mock.calls[0][0];
      expect(opts.overwrite).toBe(true);
      expect(opts.skill).toEqual(["map"]);
      expect(opts.global).toBe(false);
    });
  });
});
