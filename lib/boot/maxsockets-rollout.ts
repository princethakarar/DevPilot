/**
 * Staged rollout for the npm socket cap.
 *
 * WHY THIS EXISTS: raising maxsockets from 1 to 6 is a 2.5x speedup on the
 * host (276s -> 110s cold install of the nextjs starter), but the =1 setting
 * was originally chosen to stop the WASM sandbox SIGTERM-killing npm under
 * memory pressure — and that OOM behaviour could NOT be reproduced or ruled
 * out in a local WebContainer, because WebContainer serves tarballs from its
 * own cross-origin cache, so local installs are never network-bound and never
 * build up the concurrent-download memory that caused the kills. See
 * `docs/maxsockets-rollout.md`.
 *
 * So the raised cap ships OFF. It reaches real sessions only via an explicit
 * percentage, and the OOM rate at each cap is the signal that decides whether
 * to widen it. This is the "validate on a small % of real traffic" path, not
 * a guess dressed up as a default.
 *
 * Precedence, highest first:
 *   1. Kill switch                       -> OOM_MAXSOCKETS
 *   2. Sticky downgrade (this browser
 *      already OOM'd at the raised cap)  -> OOM_MAXSOCKETS
 *   3. Forced override (QA/debugging)    -> whatever it says
 *   4. Rollout bucket                    -> raised cap if bucketed in
 *   5. Default                           -> OOM_MAXSOCKETS
 */
import { DEFAULT_MAXSOCKETS, OOM_MAXSOCKETS } from "./npm-flags";
import { depLog, depWarn } from "../dep-cache-debug";

const BUCKET_ID_KEY = "devpilot:rollout-id";
const STICKY_DOWNGRADE_KEY = "devpilot:maxsockets-oom-at";
const FORCE_OVERRIDE_KEY = "devpilot:force-maxsockets";

/**
 * How long a browser stays downgraded after it observes an OOM at the raised
 * cap. Long enough that a user who hit it once doesn't keep re-hitting it,
 * short enough that a machine that was merely low on memory that day isn't
 * penalised forever.
 */
const STICKY_DOWNGRADE_MS = 30 * 24 * 60 * 60 * 1000;

/** 0-100. Unset/invalid means 0 — nobody gets the raised cap. */
function rolloutPercent(): number {
  const raw = process.env.NEXT_PUBLIC_MAXSOCKETS_ROLLOUT_PCT;
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function killSwitchEngaged(): boolean {
  return process.env.NEXT_PUBLIC_MAXSOCKETS_KILL_SWITCH === "1";
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, partitioned context). Bucketing then
    // falls back to a fresh random id each load, which is fine: assignment is
    // still uniform in aggregate, it just isn't sticky per browser.
  }
}

/** Stable per-browser id so a user doesn't flip between caps across reloads. */
function bucketId(): string {
  const existing = readStorage(BUCKET_ID_KEY);
  if (existing) return existing;
  const fresh =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  writeStorage(BUCKET_ID_KEY, fresh);
  return fresh;
}

/** FNV-1a -> 0..99. Only needs to be uniform, not cryptographic. */
function bucketOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

function stickyDowngradeActive(): boolean {
  const raw = readStorage(STICKY_DOWNGRADE_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < STICKY_DOWNGRADE_MS;
}

export interface MaxsocketsDecision {
  maxsockets: number;
  /** Machine-readable reason, carried into telemetry so rates can be split by cohort. */
  reason: "kill-switch" | "sticky-downgrade" | "forced" | "rollout-in" | "rollout-out";
  bucket: number;
  rolloutPct: number;
}

export function resolveMaxsockets(): MaxsocketsDecision {
  const pct = rolloutPercent();
  const bucket = bucketOf(bucketId());

  if (killSwitchEngaged()) {
    return { maxsockets: OOM_MAXSOCKETS, reason: "kill-switch", bucket, rolloutPct: pct };
  }

  if (stickyDowngradeActive()) {
    return { maxsockets: OOM_MAXSOCKETS, reason: "sticky-downgrade", bucket, rolloutPct: pct };
  }

  const forced = readStorage(FORCE_OVERRIDE_KEY);
  if (forced) {
    const parsed = Number(forced);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 32) {
      return { maxsockets: Math.floor(parsed), reason: "forced", bucket, rolloutPct: pct };
    }
  }

  if (bucket < pct) {
    return { maxsockets: DEFAULT_MAXSOCKETS, reason: "rollout-in", bucket, rolloutPct: pct };
  }

  return { maxsockets: OOM_MAXSOCKETS, reason: "rollout-out", bucket, rolloutPct: pct };
}

/**
 * Called when an install is OOM-killed at a raised cap. Pins this browser to
 * the serialised cap so the same user doesn't repeatedly pay a failed install
 * plus a retry. No-ops at OOM_MAXSOCKETS — a kill there isn't evidence about
 * the rollout, it's evidence the machine is starved regardless.
 */
export function recordOomDowngrade(capInUse: number): void {
  if (capInUse <= OOM_MAXSOCKETS) return;
  writeStorage(STICKY_DOWNGRADE_KEY, String(Date.now()));
  depWarn(
    `Pinning this browser to maxsockets=${OOM_MAXSOCKETS} for ${
      STICKY_DOWNGRADE_MS / 86_400_000
    } days after an OOM at maxsockets=${capInUse}.`
  );
}

export interface InstallOutcome {
  ok: boolean;
  exitCode: number | null;
  maxsockets: number;
  decisionReason: MaxsocketsDecision["reason"];
  bucket: number;
  durationMs: number;
  oomDetected: boolean;
  /** True when the serialised fallback ran (and therefore whether it rescued the install). */
  fallbackUsed: boolean;
  fallbackOk?: boolean;
  template?: string;
}

/**
 * STUB — deliberately not wired to a real sink.
 *
 * This is the measurement the rollout decision depends on: OOM rate at
 * maxsockets=6 vs maxsockets=1, across real sessions, split by `bucket` and
 * `decisionReason`. Point it at whatever analytics/logging you already run.
 * The shape is fixed here so the call sites don't have to change when it is.
 *
 * Deliberately fire-and-forget and never throwing: install telemetry must not
 * be able to break an install.
 */
export function reportInstallOutcome(outcome: InstallOutcome): void {
  depLog("install outcome", { ...outcome });

  const endpoint = process.env.NEXT_PUBLIC_INSTALL_TELEMETRY_URL;
  if (!endpoint) return;

  try {
    const body = JSON.stringify({ ...outcome, at: new Date().toISOString() });
    // sendBeacon survives the page being closed mid-install, which is exactly
    // when a hung/killed install is most likely to be abandoned.
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let telemetry break an install
  }
}
