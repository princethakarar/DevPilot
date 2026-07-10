# Regression guard — honest framing

## What the original ticket asked for

Step 6d of the migration ticket asked for "a regression guard for the
original WebContainer hang symptom" — i.e. proof that whatever caused
`npm run dev`/DB calls to hang or exit 1 inside WebContainer can't recur.

## Why that can't be built as literally stated

Before starting this migration, I audited where DevPilot's own database
access actually runs. The result: **DevPilot's own DB calls — `auth.ts`,
every file under `modules/*/actions/`, and `app/api/*/route.ts` — are
Next.js Server Actions / route handlers. They execute in a normal Node.js
server process, never inside the WebContainer sandbox.** WebContainer only
ever boots and hosts the *user's own edited project* (see `AGENTS.md`'s
"Boot Reliability System" / "Snapshot Pipeline" sections) — a separate,
unrelated process with no access to DevPilot's own data layer, before or
after this migration.

That means there was never an observed, reproducible "DB call hangs inside
WebContainer" bug in this codebase to regress against.

## Architecture history (for anyone reading this later)

This data layer went through two transports in one migration:

1. **Prisma (MongoDB connector)** — the original state. Removed because
   Prisma's query engine talks to MongoDB over the native wire protocol
   (raw TCP) regardless of connector, which the user wanted off entirely for
   portability reasons (not because it was observed to fail — see above).
2. **MongoDB Atlas Data API (HTTPS)** — the first replacement. Chosen
   specifically to avoid TCP. Short-lived: MongoDB has since removed App
   Services / Data API for new Atlas projects, so it was never viable for
   this user's actual cluster (a new account) — confirmed by the user
   directly, not assumed.
3. **Native `mongodb` driver (current)** — TCP again, same as Prisma
   originally used, but now via the official driver directly instead of
   through an ORM. This is fine specifically *because* of the finding in the
   previous section: DevPilot's own DB calls never ran inside a TCP-restricted
   sandbox, so there was never an actual technical blocker to a TCP driver
   here. The Data API detour solved a problem that didn't exist for this
   codebase; going back to TCP loses nothing.

## What IS an honest, verifiable regression guard

Since TCP is now intentional and correct here, the "no TCP driver" guard
from the Data API phase is gone (it would fail permanently and incorrectly
now). What's still real and worth guarding against:

**A TCP-capable driver — or the MongoDB connection string it needs — must
never end up in a Client Component bundle.** That would either crash the
build (Node built-ins like `net`/`tls`/`dns` aren't available in the
browser) or, worse, leak `DATABASE_URL` credentials into client-shipped
JavaScript.

Two layers enforce this:
- `import "server-only"` at the top of `lib/db/mongoClient.ts` — the
  authoritative check. Next.js's build fails immediately if any Client
  Component transitively imports it. (Vitest runs under plain Node, not
  Next.js's webpack build, so `server-only` is aliased to a no-op shim for
  tests only — see `lib/db/__tests__/server-only-shim.ts`; production builds
  use the real package.)
- `lib/db/__tests__/client-boundary.test.ts` — a static, CI-runnable
  secondary check: scans every file with a `"use client"` directive under
  `app/`, `modules/`, `components/` and fails if any of them import
  `lib/db/mongoClient` or `lib/db/repositories/*` directly. Faster feedback
  than a full Next.js build, and catches it in `npm test` before someone
  even tries to build.

This is a narrower, more honest claim than "the WebContainer hang can't
recur" — it's "the data layer's credentials and TCP driver never reach the
browser" — but it's the part that's actually true and actually enforced.
