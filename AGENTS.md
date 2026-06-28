<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:snapshot-pipeline-rules -->
# Snapshot Pipeline — Dependency Speed System

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
