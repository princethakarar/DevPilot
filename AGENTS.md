<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:dependency-cache-rules -->
# Dependency Cache — the system that actually runs

**Read this before the Snapshot Pipeline section below, which describes code
that is not wired into the app.**

## What runs today
`app/playground/[id]/page.tsx` -> `useNodeModulesPersistence` ->
`modules/webcontainers/lib/node-modules-persistence.ts`. Three tiers:

  1. **L1 IndexedDB** — `devpilot-nm-v1:<key>` via `idb-keyval`
  2. **L2 Vercel Blob** — `node-modules/<key>.bin`, shared across all users
  3. **L3 npm** — a real `npm install` inside WebContainer (`fallbackToNpmInstall`)

There is **no per-package resolution or caching**. The unit of caching is the
entire `node_modules` tree as one gzipped artifact. npm does all resolution and
tarball fetching itself, inside the container.

## Cache key
`computeDependencyCacheKey(packageJson, packageLockJson)` =
`SHA-256(package.json + "\n--devpilot-lock--\n" + package-lock.json)`, falling
back to package.json alone when a template has no lockfile.

Rules that are easy to break:
- Derive the key from the **template's** files, never the container's. npm
  rewrites `package-lock.json` during install, so hashing the post-install
  lockfile writes entries nothing ever looks up.
- `scripts/warm-blob-cache.ts` duplicates this derivation. Change one, change
  both — there's a test pinning them together.
- Templates ship their lockfile (`path-to-json.ts` no longer ignores it).
  Lockfiles bypass `maxFileSize` and are omitted whole rather than truncated;
  a truncated lockfile breaks npm outright.

## Bundle format
`[4-byte LE header length][JSON header][gzip payload]`. The payload is every
file's bytes concatenated in the header's entry order — positional, so header
and payload must be written in lockstep. Symlinks are unrepresentable;
`regenerateBinLinks` rebuilds `node_modules/.bin` after every restore.

Capture **streams** into gzip and restore **streams** out of gunzip. Do not
reintroduce a "collect every file then concat" step: the nextjs tree is
404MB raw / 16.7k files inside WebContainer, and buffering it twice
(~800MB peak) is what previously killed the tab before it could ever upload,
which is why Next.js had no Blob entry at all.

## Concurrency — two independent limits
- `VFS_READ_CONCURRENCY` / `VFS_WRITE_CONCURRENCY` (node-modules-persistence.ts)
  bound WASM filesystem calls.
- `DEFAULT_MAXSOCKETS` / `OOM_MAXSOCKETS` (`lib/boot/npm-flags.ts`) bound npm's
  network sockets.

Keep them separate. They were conflated before, so an OOM-driven drop to one
socket also crippled local file I/O that had nothing to do with the memory
pressure.

The cap is **not** a constant at the call site — it comes from
`resolveMaxsockets()` (`lib/boot/maxsockets-rollout.ts`), which defaults every
session to `OOM_MAXSOCKETS` (1). `DEFAULT_MAXSOCKETS` (6) reaches users only
via `NEXT_PUBLIC_MAXSOCKETS_ROLLOUT_PCT`, because the raised cap's OOM
behaviour **cannot be validated locally** — WebContainer serves tarballs from
its own cross-origin cache (so installs aren't network-bound) and its memory is
invisible to `measureUserAgentSpecificMemory()` (so pressure can't be watched).
See `docs/maxsockets-rollout.md` for the staged-rollout procedure.

The **SIGTERM/exit-143 fallback to `OOM_MAXSOCKETS` in `fallbackToNpmInstall`
is mandatory**, not an optimisation — it is what re-establishes the OOM
guarantee that pinning to 1 used to provide. The live install path has no retry
engine around it, so the fallback must stay inside that function.

Verified against a real kill in a real sandbox: WebContainer reports a killed
process as **exit 143 with empty output**, so `isOomExit`'s exit-code check is
load-bearing and its output heuristics never fire for kills. Don't drop it.

## Debugging
`localStorage.setItem("devpilot:debug-deps", "1")` (or
`NEXT_PUBLIC_DEP_CACHE_DEBUG=1`) turns on per-phase timings and tier hit/miss
logs — see `lib/dep-cache-debug.ts`. Tier-degradation warnings are always on.

Test hooks (all localStorage, all documented in `docs/maxsockets-rollout.md`):
`devpilot:kill-install-once` really kills the next install so the genuine exit
code flows through real detection; `devpilot:force-oom-once` only forces the
recovery branch and **skips detection entirely**, so it proves nothing about
whether a real kill is recognised; `devpilot:force-maxsockets` pins a cap.

## Blob has NO eviction — purge is manual
L1 (IndexedDB) deletes expired entries on read and runs a 400MB LRU. **The
Blob tier has neither.** Expiry is checked only at read time and produces a
*miss*, not a delete, so anything that stops being looked up occupies storage
forever. Run `npx tsx scripts/purge-blob-cache.ts` (dry run by default,
`--yes` to apply) periodically or after any cache-key change.

Do NOT purge on "doesn't match a current starter key" — users edit
package.json, so a fresh non-starter entry is usually a live cache for a
custom dependency set. The sound criterion is expiry: an expired entry can
never be served, and reviving its key requires an upload that overwrites it
anyway. `--include-legacy-orphans` additionally removes still-fresh entries
under a superseded key scheme, which are provably unreachable.

## Warm-cache pre-population
`npx tsx scripts/warm-blob-cache.ts [templates...] [--force] [--dry-run]`
installs each starter with `--os=linux --cpu=x64` (WebContainer's platform —
installing on a Windows/macOS host without these ships the wrong native
binaries) and uploads the bundle server-side, bypassing the route's freshness
write-gate.
<!-- END:dependency-cache-rules -->

<!-- BEGIN:snapshot-pipeline-rules -->
# Snapshot Pipeline — NOT WIRED UP

**Dead code as of this writing.** Nothing imports `bootProject`,
`useProjectBoot`, or `loadTemplateSnapshot` outside their own definitions, and
every hash in `TEMPLATE_SNAPSHOT_HASHES` is `""` — so even if it were wired up,
`loadTemplateSnapshot` would take its `if (!hash)` branch straight to npm. The
one part of `lib/snapshot/` that IS live is `fallbackToNpmInstall`, which
`useNodeModulesPersistence` calls directly. Kept below for reference.

## Architecture Overview
Three caching layers, tried in order:
  1. **IndexedDB cache** (`lib/snapshot/cache.ts`) — .tar.gz blobs stored via `idb-keyval`, keyed on content hash
  2. **CDN snapshot** (`lib/snapshot/loader.ts`) — `https://snapshots.devpilot.app/{template}/{hash}.tar.gz`
  3. **npm fallback** — `npm install --no-audit --no-fund --prefer-offline`

## Key decisions
- Snapshots are extracted **inside WebContainer** via a Node.js script, not parsed in the browser
- The extraction script (`EXTRACT_SCRIPT` in `config.ts`) uses Node.js built-in `zlib` + manual tar parsing — no npm packages needed
- Browser writes raw .tar.gz bytes to container temp file, then spawns `node extract-snapshot.js`
- Progress is streamed from the extraction script as JSON lines on stdout
- Snapshot hashes are pinned in `lib/snapshot/config.ts` and updated by the CI pipeline

## Adding a new template
1. Add to `TEMPLATES` array in `scripts/build-snapshots.ts`
2. Add entry in `lib/snapshot/config.ts` (`TEMPLATE_SNAPSHOT_HASHES`, `TEMPLATE_DEPENDENCY_PROFILES`)
3. Add entry in `lib/template.ts` for the path lookup
4. Update `TEMPLATE_ID_MAP` in `webcontainer-preview.tsx` if folder name differs
5. Run `npx tsx scripts/build-snapshots.ts` to generate snapshots

## CI/CD
The build script produces:
- `snapshots/{template}-{hash}.tar.gz` per template
- `snapshots/manifest.json` with metadata
- Upload commands for S3/R2 at the end

After upload, copy the hashes from the output into `lib/snapshot/config.ts`.

## Boot flow
`useProjectBoot` hook → `bootProject()` → `loadTemplateSnapshot()` → extract in container → start dev server
All phases emit progress via `BootCallback`, consumed by `DependencyStatus` component.

## Critical: server-ready event
Do NOT await `npm run dev` to completion. Use `instance.on("server-ready", ...)` which fires when the dev server is listening.
<!-- END:snapshot-pipeline-rules -->

<!-- BEGIN:boot-reliability-rules -->
# Boot Reliability System

## Root cause of "exit code 1 on first try, works on retry"
WebContainer's WASM-backed virtual filesystem has a write-back cache. When `npm install`
exits with code 0, the process's file writes may still be flushing from the Node.js heap
into shared WASM memory. If `npm run dev` starts immediately, it reads a PARTIAL
`node_modules`. This is the #1 cause of intermittent exit code 1.

## Fix (implemented)
1. **500ms artificial delay** after install exit before verification (`project-booter.ts`)
2. **Install verification** — checks node_modules exists, .bin has entries, and all
   key packages (vite, react, next, etc.) have valid package.json files
3. **Integrity check** — verifies main entry files actually exist on disk for each
   key package, not just the package.json
4. **Smart retry engine** — 3 retries with strategy progression:
   - Retry 1: normal flags, 1s delay
   - Retry 2: `--legacy-peer-deps`, 2s delay (catches ERESOLVE)
   - Retry 3: `--force`, 4s delay (catches EINTEGRITY)
5. **Cleanup between retries** — `devProcess.kill()`, `cleanupWebContainer()`, 300ms wait

## WebContainer spawn rules
- `kill()` is available on `WebContainerProcess` returned by `spawn()`
- `fs` API does NOT have `stat()` — use `readdir()` to check directory existence
- `fs.readdir()` on non-existent path throws, so wrap in try/catch
- `server-ready` event must be used to detect dev server readiness
- Do NOT `await` the `exit` promise of the dev server — it only resolves when the
  process ends, which is never during normal operation
- Use `output.pipeTo()` to stream process output — but DO NOT cancel/pull from the
  stream yourself AND also pipeTo it (pipeTo consumes the stream)

## Error classification (`lib/boot/error-detector.ts`)
npm output is scanned in real time for these patterns:
- `ERESOLVE` → peer dependency conflict → retry with `--legacy-peer-deps`
- `ENOTFOUND` / `ETIMEDOUT` → network error → show "Check your connection"
- `ENOSPC` → out of memory → show "Browser tab is running low on memory"
- `EINTEGRITY` → package corruption → retry with `--force`
- `Cannot find module` → incomplete install → trigger re-install
- `EADDRINUSE` → port conflict → kill prev process + retry

## UI contract
The `BootState` interface always includes:
- `errorCategory` — machine-readable action hint (e.g. "retry:legacy-peers", "error:oom")
- `errorSuggestion` — human-readable suggestion text
- `retryCount` / `maxRetries` — for "Attempt 2/4" badge
- `currentStrategy` — e.g. "Legacy Peer Deps Mode"
- NEVER surface "exit code 1" directly to the user

## Integration points
- `lib/boot/error-detector.ts` — real-time npm output parsing
- `lib/boot/install-verifier.ts` — post-install validation
- `lib/boot/retry-engine.ts` — exponential backoff + strategy shifts
- `lib/boot/process-cleanup.ts` — kill + clean + port release
- `lib/project-booter.ts` — orchestrates all 4 phases with retry wrapper
<!-- END:boot-reliability-rules -->
