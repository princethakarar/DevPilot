# Validating the npm socket cap (maxsockets 1 -> 6)

## Why this isn't just a config change

`--maxsockets=1` was chosen to stop the WASM sandbox SIGTERM-killing npm under
memory pressure. Raising it is worth real money in install time:

| config | cold install, nextjs starter (host machine) |
|---|---|
| `maxsockets=1` | 276 s |
| `maxsockets=15` (npm default) | 110 s |

But that measurement is from a **host machine**, not the sandbox — and the
sandbox is where the OOM risk lives.

## Why the sandbox benchmark could not be produced locally

Two independent blockers, both confirmed rather than assumed:

1. **Installs in a local WebContainer are not network-bound.** WebContainer
   serves package tarballs from its own cache in a cross-origin
   (`stackblitz.com`) frame. Measured: 5,672 ms at `maxsockets=1` vs 5,609 ms
   at `maxsockets=6` — a 1% difference, i.e. noise. There is nothing to
   parallelise because nothing is being downloaded, so the concurrent-download
   memory that caused the original kills never builds up either.

2. **The sandbox's memory is not observable from the host page.**
   `performance.measureUserAgentSpecificMemory()` is available and the page is
   cross-origin isolated (`crossOriginIsolated === true`), but its breakdown
   attributes memory only to `localhost:3000`. The `stackblitz.com` frame
   contributes **zero entries**. This is by design — cross-origin isolation
   exists precisely to stop one origin measuring another's memory.
   `performance.memory.jsHeapSizeLimit` reports the *parent page's* 3.8 GB
   limit, which says nothing about the sandbox's ceiling.

Clearing WebContainer's cache would need site data cleared for its own origins,
which the app cannot do to a cross-origin frame.

**Therefore: the raised cap's OOM behaviour cannot be validated locally at all.**
It can only be validated on real traffic.

## What ships by default

Nothing changes for users until you opt in. `resolveMaxsockets()` defaults
every session to `OOM_MAXSOCKETS` (1) — byte-for-byte the pre-change behaviour.

Precedence, highest first:

| # | Condition | Cap |
|---|---|---|
| 1 | `NEXT_PUBLIC_MAXSOCKETS_KILL_SWITCH=1` | 1 |
| 2 | Browser already OOM'd at a raised cap (30-day sticky) | 1 |
| 3 | `localStorage["devpilot:force-maxsockets"]` (QA only) | as set |
| 4 | Bucketed into `NEXT_PUBLIC_MAXSOCKETS_ROLLOUT_PCT` | 6 |
| 5 | default | 1 |

Bucketing is a stable per-browser id hashed to 0–99, so a user doesn't flip
caps between reloads.

## Rollout procedure

1. **Wire up telemetry.** `reportInstallOutcome()` in
   `lib/boot/maxsockets-rollout.ts` is a stub — it logs behind the debug flag
   and POSTs to `NEXT_PUBLIC_INSTALL_TELEMETRY_URL` if set. Point it at your
   analytics. The payload shape is already fixed, so call sites don't change.

2. **Ship at 0%.** Confirm outcomes are flowing and that
   `maxsockets: 1, reason: "rollout-out"` dominates. This is your baseline OOM
   rate at the safe cap — you need it to compare against.

3. **Go to 5%.** `NEXT_PUBLIC_MAXSOCKETS_ROLLOUT_PCT=5`. Watch, split by
   `decisionReason`:
   - `oomDetected` rate for `rollout-in` vs `rollout-out`
   - `fallbackOk` — when the OOM path fires, does the serialised retry actually
     rescue it, or does the install just fail slower?
   - `durationMs` for successful installs — this is the payoff being bought.

4. **Decide.** Widen to 25% / 50% / 100% only while the `rollout-in` OOM rate
   stays at or near the `rollout-out` baseline. If `fallbackOk` is low, stop —
   that means the fallback isn't a real safety net under genuine memory
   pressure, which is the one thing local testing could not confirm (see
   "known gap" below).

5. **Abort** with `NEXT_PUBLIC_MAXSOCKETS_KILL_SWITCH=1` — it outranks
   everything and needs no code change.

## What has actually been verified

A **real** kill of a live npm process in a real WebContainer
(`localStorage["devpilot:kill-install-once"]="1"`):

```
socket cap resolved {"maxsockets":6,"reason":"forced","bucket":34}
TEST HOOK: killing the live npm process in 4000ms to observe a real kill.
npm install exited {"exitCode":143,"classifiedAsOom":true,"outputTail":""}
npm was killed by the sandbox (exit 143) at maxsockets=6 — retrying fully serialised at maxsockets=1.
npm install exited {"exitCode":0,"maxsockets":1,"outputTail":"added 75 packages in 26s"}
install outcome {"ok":true,"oomDetected":true,"fallbackUsed":true,"fallbackOk":true,...}
npm install succeeded on the serialised OOM-fallback attempt.
```

Confirms:
- WebContainer really does report a killed process as **exit 143**. This was
  previously an assumption, and the whole fallback rests on it.
- **`outputTail` is empty on a kill** — the output-based heuristics in
  `isOomExit()` ("SIGTERM", "Killed", …) would NOT have caught this. The exit
  code check is doing all the work. Do not remove it.
- Detection, 3 s settle, `.npmrc` rewrite, respawn at 1 socket, and recovery
  all execute correctly against a real sandbox.
- The sticky downgrade engages and, on the next boot, outranks a still-present
  forced override (`reason: "sticky-downgrade"`, cap 1).

## Known gap

The kill above was induced by `process.kill()`, not by genuine memory
exhaustion. Under a real OOM the sandbox is already starved, so it remains
unproven that 3 s is enough to reclaim memory and that the serialised retry
can complete. That question is only answerable from `fallbackOk` on real
traffic — which is exactly what step 3 measures.

## Test hooks (localStorage)

| key | effect |
|---|---|
| `devpilot:debug-deps` = `1` | per-phase timings + tier hit/miss logs |
| `devpilot:force-maxsockets` = `N` | force a cap (1–32), QA only |
| `devpilot:kill-install-once` = `1` | really kill the next install 4 s in |
| `devpilot:force-oom-once` = `1` | treat next install as OOM **without** a real kill (skips detection) |
| `devpilot:maxsockets-oom-at` | delete to clear a sticky downgrade |
