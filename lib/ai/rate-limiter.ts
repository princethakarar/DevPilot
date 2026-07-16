/**
 * Per-user sliding-window rate limit for the inline-completion endpoint, which
 * can fire on every pause in typing. In-memory only (a module-level Map) —
 * this app runs as a single Node process with no Redis/Upstash configured
 * (see package.json), so this resets on redeploy and doesn't share state
 * across multiple instances. That's an acceptable tradeoff for "stop obvious
 * abuse/cost blowups," not a hard multi-instance guarantee.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const requestLog = new Map<string, number[]>();

/** Returns true if the request is allowed, false if the caller should be silently no-op'd. */
export function checkInlineCompletionRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (requestLog.get(userId) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(userId, timestamps);
    return false;
  }

  timestamps.push(now);
  requestLog.set(userId, timestamps);

  // Bound memory: drop entries for users who haven't made a request in a
  // while, instead of growing this map forever across a long-running process.
  if (requestLog.size > 5000) {
    for (const [id, times] of requestLog) {
      if (times.every((t) => t <= windowStart)) requestLog.delete(id);
    }
  }

  return true;
}
