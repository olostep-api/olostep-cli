import * as crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PKCE_ALPHABET,
  b64url,
  deriveChallenge,
  randomSessionId,
  randomVerifier,
} from "./auth.js";

describe("b64url", () => {
  it("produces RFC 7636 base64url output (no =, no +, no /)", () => {
    // Buffer that triggers all three substitutions in std base64.
    // 0xfb 0xff 0xbf → "+/+/" in standard base64; padded to length 4 (no =).
    const tricky = Buffer.from([0xfb, 0xff, 0xbf]);
    const encoded = b64url(tricky);
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("strips trailing = padding", () => {
    // Single byte → 2 base64 chars + "==" padding.
    expect(b64url(Buffer.from([0x00]))).toBe("AA");
  });

  it("maps + → - and / → _", () => {
    const encoded = b64url(Buffer.from([0xfb, 0xff, 0xbf, 0xfb, 0xff, 0xbf]));
    // Standard base64 of those 6 bytes is "+/+/+/+/" — must become "-_-_-_-_".
    expect(encoded).toBe("-_-_-_-_");
  });

  it("is deterministic", () => {
    const buf = Buffer.from("hello world");
    expect(b64url(buf)).toBe(b64url(buf));
  });
});

describe("randomVerifier", () => {
  it("returns the requested length (default 64)", () => {
    expect(randomVerifier()).toHaveLength(64);
    expect(randomVerifier(43)).toHaveLength(43);
    expect(randomVerifier(128)).toHaveLength(128);
  });

  it("only uses chars from the RFC 7636 unreserved alphabet", () => {
    const v = randomVerifier(256);
    for (const ch of v) {
      expect(PKCE_ALPHABET.includes(ch)).toBe(true);
    }
    // Sanity: regex check matches the RFC 7636 set verbatim.
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("returns different values across calls (overwhelmingly likely)", () => {
    const a = randomVerifier();
    const b = randomVerifier();
    expect(a).not.toBe(b);
  });
});

describe("deriveChallenge", () => {
  it("is the base64url-encoded SHA-256 of the verifier", () => {
    const verifier = "test-verifier-1234567890";
    const expected = crypto.createHash("sha256").update(verifier).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(deriveChallenge(verifier)).toBe(expected);
  });

  it("is deterministic for the same input", () => {
    const v = randomVerifier();
    expect(deriveChallenge(v)).toBe(deriveChallenge(v));
  });

  it("uses base64url (no =, +, /)", () => {
    const challenge = deriveChallenge("any-input");
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("matches the RFC 7636 example (verifier 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')", () => {
    // Per RFC 7636 §4.6, this verifier hashes to the listed challenge.
    expect(deriveChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("randomSessionId", () => {
  it("returns a base64url string (no padding/+//)", () => {
    const sid = randomSessionId();
    expect(sid).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(sid.length).toBeGreaterThanOrEqual(43); // 32 bytes → ~43 chars.
  });

  it("returns different values across calls", () => {
    expect(randomSessionId()).not.toBe(randomSessionId());
  });
});
