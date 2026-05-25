import { getApiBaseUrl, resolveApiKey } from "./config.js";

export class OlostepApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  apiKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 60_000;

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const apiKey = opts.apiKey || resolveApiKey();
  const baseUrl = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "olostep-cli (node)",
  };
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Forward an outer signal if given.
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new OlostepApiError(0, `Request timed out after ${timeoutMs}ms: ${method} ${url}`, null);
    }
    throw new OlostepApiError(0, `Network error: ${err?.message || err}`, null);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }

  if (!res.ok) {
    const detail = typeof parsed === "object" && parsed && "error" in (parsed as any)
      ? (parsed as any).error
      : typeof parsed === "string"
        ? parsed
        : res.statusText;
    throw new OlostepApiError(res.status, `HTTP ${res.status}: ${detail}`, parsed);
  }
  return parsed as T;
}

export const api = {
  get:  <T>(p: string, o?: RequestOptions) => request<T>("GET", p, null, o),
  post: <T>(p: string, b?: unknown, o?: RequestOptions) => request<T>("POST", p, b, o),
  patch:<T>(p: string, b?: unknown, o?: RequestOptions) => request<T>("PATCH", p, b, o),
  del:  <T>(p: string, o?: RequestOptions) => request<T>("DELETE", p, null, o),
};

/**
 * Tiny POST to a non-authenticated CLI auth endpoint (no Bearer header).
 */
export async function postCliAuthStatus(payload: {
  session_id: string;
  code_verifier: string;
}, timeoutMs = 10_000): Promise<{ status: string; apiKey?: string }> {
  const url = `${getApiBaseUrl()}/cli-auth-status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "olostep-cli (node)" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!res.ok) {
      throw new OlostepApiError(res.status, `HTTP ${res.status}: ${text}`, data);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
