import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isJsonMode } from "./output.js";

describe("isJsonMode", () => {
  beforeEach(() => {
    delete process.env.OLOSTEP_JSON;
  });

  afterEach(() => {
    delete process.env.OLOSTEP_JSON;
  });

  it("returns false when opts.json is false and env var is unset", () => {
    expect(isJsonMode({ json: false })).toBe(false);
  });

  it("returns false when opts.json is undefined and env var is unset", () => {
    expect(isJsonMode({})).toBe(false);
  });

  it("returns true when opts.json is true", () => {
    expect(isJsonMode({ json: true })).toBe(true);
  });

  it("returns true when OLOSTEP_JSON=1", () => {
    process.env.OLOSTEP_JSON = "1";
    expect(isJsonMode({})).toBe(true);
  });

  it("returns true when OLOSTEP_JSON=true", () => {
    process.env.OLOSTEP_JSON = "true";
    expect(isJsonMode({})).toBe(true);
  });

  it("returns true when OLOSTEP_JSON=yes", () => {
    process.env.OLOSTEP_JSON = "yes";
    expect(isJsonMode({})).toBe(true);
  });

  it("returns true when OLOSTEP_JSON=on", () => {
    process.env.OLOSTEP_JSON = "on";
    expect(isJsonMode({})).toBe(true);
  });

  it("returns true when OLOSTEP_JSON=TRUE (case-insensitive)", () => {
    process.env.OLOSTEP_JSON = "TRUE";
    expect(isJsonMode({})).toBe(true);
  });

  it("returns false when OLOSTEP_JSON=0", () => {
    process.env.OLOSTEP_JSON = "0";
    expect(isJsonMode({})).toBe(false);
  });

  it("returns false when OLOSTEP_JSON=false", () => {
    process.env.OLOSTEP_JSON = "false";
    expect(isJsonMode({})).toBe(false);
  });

  it("returns false when OLOSTEP_JSON is empty string", () => {
    process.env.OLOSTEP_JSON = "";
    expect(isJsonMode({})).toBe(false);
  });

  it("returns true when opts.json is false but OLOSTEP_JSON=1 (env overrides flag absence)", () => {
    process.env.OLOSTEP_JSON = "1";
    expect(isJsonMode({ json: false })).toBe(true);
  });
});
