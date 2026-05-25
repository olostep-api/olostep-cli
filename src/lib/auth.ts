import * as crypto from "node:crypto";
import open from "open";

import { postCliAuthStatus } from "./api-client.js";
import { getCliAuthPageUrl, writeCredentialsApiKey } from "./config.js";
import { c, sym } from "./colors.js";

export const PKCE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomVerifier(length = 64): string {
  // RFC 7636 unreserved alphabet, 43-128 chars; 64 is comfortable.
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PKCE_ALPHABET[bytes[i] % PKCE_ALPHABET.length];
  }
  return out;
}

export function randomSessionId(): string {
  return b64url(crypto.randomBytes(32));
}

export function deriveChallenge(verifier: string): string {
  return b64url(crypto.createHash("sha256").update(verifier).digest());
}

export interface LoginOptions {
  noBrowser?: boolean;
  pollSeconds?: number;
  timeoutSeconds?: number;
}

export interface LoginResult {
  apiKey: string;
  credentialsPath: string;
}

/**
 * Browser PKCE auth flow:
 *   1. Generate code_verifier (64 chars), code_challenge (SHA-256), session_id.
 *   2. Open https://www.olostep.com/cli-auth?code_challenge=...#session_id=...
 *   3. Poll POST /cli-auth-status with {session_id, code_verifier} until
 *      status === "complete", then save apiKey to credentials.json.
 */
export async function runLogin(opts: LoginOptions = {}): Promise<LoginResult> {
  const verifier = randomVerifier();
  const challenge = deriveChallenge(verifier);
  const sessionId = randomSessionId();

  const pageBase = getCliAuthPageUrl();
  const authorizeUrl =
    `${pageBase}?code_challenge=${encodeURIComponent(challenge)}` +
    `#session_id=${encodeURIComponent(sessionId)}`;

  process.stderr.write(
    `\n  ${c.bold("Olostep sign-in")}\n` +
    `  Open this URL in your browser, then click ${c.bold("Authorize")}:\n` +
    `  ${c.blue(authorizeUrl)}\n\n`,
  );

  if (!opts.noBrowser) {
    try {
      await open(authorizeUrl);
    } catch {
      // If we couldn't open a browser the URL is already on stderr — fine.
    }
  }

  const pollMs = Math.max(500, Math.round((opts.pollSeconds ?? 3) * 1000));
  const timeoutMs = Math.max(60_000, Math.round((opts.timeoutSeconds ?? 600) * 1000));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let res: { status: string; apiKey?: string };
    try {
      res = await postCliAuthStatus({ session_id: sessionId, code_verifier: verifier });
    } catch (err: any) {
      // Transient network errors — keep polling until deadline.
      process.stderr.write(c.dim(`  (still waiting${sym.dots})\r`));
      await sleep(pollMs);
      continue;
    }
    if (res.status === "complete" && res.apiKey) {
      const credentialsPath = writeCredentialsApiKey(res.apiKey);
      process.stderr.write(`  ${c.green(sym.ok)} Signed in. Key saved to ${c.dim(credentialsPath)}\n`);
      return { apiKey: res.apiKey, credentialsPath };
    }
    process.stderr.write(c.dim(`  (waiting for Authorize${sym.dots})\r`));
    await sleep(pollMs);
  }
  throw new Error(`Timed out after ${opts.timeoutSeconds ?? 600}s waiting for sign-in.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
