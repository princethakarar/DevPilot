/**
 * Per-model rate limits for the agent's Groq calls.
 *
 * Replaces the single global TPM_LIMIT_ESTIMATE that token-budget.ts used to
 * carry. One constant could never be right for both models at once: measured
 * live from `x-ratelimit-limit-tokens`, the primary
 * ("llama-3.3-70b-versatile") gets 12,000 TPM while the fallback
 * ("llama-3.1-8b-instant") gets 6,000 — so a single 6000 figure was
 * simultaneously half the primary's real budget (over-trimming every request
 * for no reason) and exactly right for the fallback.
 *
 * The constants below are a BOOTSTRAP ONLY, used until the first response for
 * a given model comes back. Groq reports the real limit on every response —
 * success or error — so recordObservedLimits() overwrites them with whatever
 * the provider actually says. That matters because hardcoded limits go stale
 * silently the moment the account changes tier or Groq adjusts its free-tier
 * allowances, which is the same class of invisible breakage that took out
 * qwen/qwen3-32b (see model-client.ts's DEFAULT_AGENT_MODEL comment).
 */

export interface ModelRateLimits {
  /** Tokens per minute. Groq bills prompt_tokens + max_tokens against this. */
  tpm: number;
  /** Tokens per day, or null when we've never observed one for this model. */
  tpd: number | null;
}

/**
 * Measured 2026-08-09 against the live API with the project's own key.
 * `tpd` for the primary comes from a real 429 body ("tokens per day (TPD):
 * Limit 100000"); the fallback's daily limit has never been observed, so it
 * is null rather than a guess.
 */
const KNOWN_LIMITS: Record<string, ModelRateLimits> = {
  "llama-3.3-70b-versatile": { tpm: 12_000, tpd: 100_000 },
  "llama-3.1-8b-instant": { tpm: 6_000, tpd: null },
};

/**
 * Used for a model we have no measurement for (a custom AGENT_GROQ_MODEL, or
 * a new Groq model). Deliberately the SMALLER of the two known limits: pacing
 * too conservatively costs some throughput, pacing too aggressively costs the
 * run itself via a 429 the pacer exists to prevent.
 */
const CONSERVATIVE_LIMITS: ModelRateLimits = { tpm: 6_000, tpd: null };

/** Minimal shape of what we read off a response — a real `Headers`, or any test double exposing `get`. */
export interface HeaderLike {
  get(name: string): string | null | undefined;
}

const observed = new Map<string, ModelRateLimits>();

/**
 * Records the provider's own reported TPM for this model, taken from every
 * response we get back. Silently ignores a missing/unparseable header — a
 * response without it (a network-level error page, a test double) simply
 * leaves the previous value in place rather than clobbering it with a zero.
 *
 * Only TPM is observable this way: Groq exposes `x-ratelimit-limit-tokens`
 * for the minute window but sends no per-day header, so `tpd` always comes
 * from KNOWN_LIMITS.
 */
export function recordObservedLimits(model: string, headers: HeaderLike): void {
  const raw = headers.get("x-ratelimit-limit-tokens");
  if (raw === null || raw === undefined) return;
  const tpm = Number(raw);
  if (!Number.isFinite(tpm) || tpm <= 0) return;

  const current = limitsForModel(model);
  if (current.tpm === tpm) return;
  observed.set(model, { tpm, tpd: current.tpd });
}

/** The best limits we have for this model: provider-observed first, then measured constants, then conservative. */
export function limitsForModel(model: string): ModelRateLimits {
  return observed.get(model) ?? KNOWN_LIMITS[model] ?? CONSERVATIVE_LIMITS;
}

/** Test-only: drops everything learned from live responses. */
export function __resetObservedLimitsForTests(): void {
  observed.clear();
}
