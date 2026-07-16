/**
 * Deliberately its own file, with no "server-only" import and no "use server"
 * directive — two independent reasons these plain values can't live next to
 * where they're otherwise used:
 *  - store.ts has "server-only", which only behaves (no-ops out) inside
 *    Next's own webpack build; scripts/ensure-checkpoint-indexes.ts runs
 *    under plain `tsx` outside that build and needs CHECKPOINT_TTL_SECONDS
 *    without pulling that guard in.
 *  - agent-revert.ts has "use server", and Next requires every export of a
 *    "use server" file to be an async Server Action — a plain numeric
 *    constant (CHECKPOINT_TTL_HOURS, read directly by the Agent panel UI)
 *    can't be exported from there.
 */
export const CHECKPOINT_TTL_SECONDS = 48 * 60 * 60; // 172800 (48 hours)

/** Hours the "Checkpoints are kept for N hours" UI note reads — derived here, never duplicated. */
export const CHECKPOINT_TTL_HOURS = CHECKPOINT_TTL_SECONDS / 3600;
