/**
 * Generic poll loop. Calls `fn` repeatedly until `isDone` returns true or the
 * timeout elapses. On timeout, throws PollingTimeoutError with the last
 * response attached so callers can surface a useful "still running" message.
 */

export class PollingTimeoutError<T = unknown> extends Error {
  last: T | undefined;
  elapsedMs: number;
  constructor(message: string, last: T | undefined, elapsedMs: number) {
    super(message);
    this.name = "PollingTimeoutError";
    this.last = last;
    this.elapsedMs = elapsedMs;
  }
}

export interface PollOptions<T> {
  intervalMs: number;
  timeoutMs: number;
  onTick?: (r: T, elapsedMs: number) => void;
}

export async function pollUntil<T>(
  fn: () => Promise<T>,
  isDone: (r: T) => boolean,
  opts: PollOptions<T>,
): Promise<T> {
  const start = Date.now();
  let last: T | undefined;
  // Guard against zero/negative intervals which would busy-loop.
  const interval = Math.max(50, Math.floor(opts.intervalMs));
  const timeout = Math.max(0, Math.floor(opts.timeoutMs));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - start;
    last = await fn();
    if (isDone(last)) return last;
    if (opts.onTick) {
      try { opts.onTick(last, elapsed); } catch { /* ignore tick errors */ }
    }
    if (Date.now() - start + interval > timeout) {
      throw new PollingTimeoutError(
        `Polling timed out after ${Math.round((Date.now() - start) / 1000)}s`,
        last,
        Date.now() - start,
      );
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
