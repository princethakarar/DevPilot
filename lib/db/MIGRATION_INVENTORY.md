# Prisma (MongoDB connector) → MongoDB data layer migration inventory

Living checklist. Source of truth for what must be replaced and, later, what
must be tested (Step 6 in the migration plan maps 1:1 to the checkboxes here).

## Architecture pivot: Atlas Data API → native `mongodb` driver

This migration went through two transports. First pass replaced Prisma with
the **MongoDB Atlas Data API** (HTTPS) to avoid a raw TCP dependency. That
had to be reverted: **MongoDB has removed App Services / Data API for new
Atlas projects**, confirmed by the user directly — their account has no way
to generate a Data API URL or key, only a standard `mongodb+srv://`
connection string. Everything under `lib/db/` now talks to MongoDB via the
official **native `mongodb` driver** (`lib/db/mongoClient.ts`) instead.

This is not a regression on the original TCP concern. The reason Data API
was chosen in the first place — "the app can't open raw TCP sockets" — was
already established (see "Why", below) to not actually apply to DevPilot's
own database calls, which run in a real Next.js Node.js server process, not
inside the WebContainer sandbox. Going back to a TCP-capable driver costs
nothing here; see `REGRESSION_GUARD.md` for the full reasoning and for what
guards the actually-relevant risk (the driver/connection-string reaching a
browser bundle).

**What changed as a result:**
- `lib/db/dataApiClient.ts` deleted; `lib/db/mongoClient.ts` replaces it with
  the exact same method surface (`findOne`/`find`/`insertOne`/.../`deleteMany`
  taking a collection name + plain filter/update objects) — so every
  repository in `lib/db/repositories/` and every relation/cascade unit test
  needed **zero logic changes**, only renamed imports (`DataApiClient` →
  `DbClient`, `getDataApiClient` → `getMongoDbClient`, `DataApiError` →
  `DbError`).
- `.env`: `MONGODB_DATA_API_URL`, `MONGODB_DATA_API_KEY`, `MONGODB_DATA_SOURCE`
  removed. `DATABASE_URL` (the connection string) and `MONGODB_DATABASE` are
  the only two required vars now.
- `package.json`: added `mongodb` (driver) and `server-only` (build-time
  guard against this module reaching a Client Component — see
  `REGRESSION_GUARD.md`).
- Connection caching uses the same `globalThis`-cached-singleton pattern the
  old `lib/db.ts` Prisma client used, adapted for `MongoClient.connect()`.
- `modules/auth/actions/index.ts`'s `retryQuery` now checks
  `DbError.retryable` (classified from driver error names/labels — network/
  server-selection errors) instead of an HTTP status code.

## Status

All 31 call sites are migrated, `npx tsc --noEmit` is clean, and the vitest
suite passes. Prisma has been fully removed: `@prisma/client`, `prisma`, and
`@auth/prisma-adapter` uninstalled; `lib/db.ts`, `prisma/schema.prisma`, and
`prisma.config.ts` deleted. This was safe because the schema had a single
`provider = "mongodb"` datasource — no mixed-DB models were in scope.

Two things discovered and fixed mid-migration, beyond the original audit —
both transport-independent, unaffected by the Data-API-to-native-driver pivot:
- **`_id` vs `.id` shape mismatch**: Prisma's `@map("_id")` transparently
  exposed Mongo's `_id` as `.id` to every consumer; a raw driver/API has no
  such remapping. Fixed via `lib/db/mapId.ts` (`mapId()`/`WithMongoId<T>`) —
  every repository read/insert translates at the boundary so callers still
  see `.id`, matching the original Prisma contract exactly.
- **`.nullish()` vs `.nullable()` on read schemas**: optional fields validated
  with `.nullish()` on the *read* schemas allowed `undefined`, but Prisma
  always returned `null` for an unset optional scalar (never omitted the
  key). Read schemas now use `.nullable()`; `*CreateInput` schemas keep
  `.nullish()` (caller may omit), and each create function coalesces
  `?? null` before writing, so the wire document always has the key.

## Testing (Step 6)

- **6a — data-access layer unit tests**: `lib/db/__tests__/mongoClient.test.ts`.
  Uses the injectable `dbImpl` escape hatch in `MongoConfig` (mirrors the old
  Data API client's injectable `fetchImpl`) to fake the driver's `Db`/`Collection`
  without a network call. Covers success/null-findOne/empty-find, filter/
  projection/sort/limit/skip pass-through, `insertMany([])` short-circuiting,
  the index-keyed `insertedIds` object shape the driver actually returns, and
  `DbError` wrapping + `retryable` classification for `MongoNetworkError`/
  `MongoServerSelectionError`/error-label-based retryable errors vs. an
  ordinary logic error (duplicate key) staying non-retryable.
- **6b — validation layer unit tests**: `lib/db/__tests__/schemas.test.ts`. 1:1 against
  every `*CreateInputSchema` — required fields, enum values, nullable-vs-omittable
  fields, non-integer rejection on `expiresAt`, empty-string rejection where
  Prisma had a non-optional `String`. Transport-independent — unaffected by
  the Data-API-to-native-driver pivot.
- **6c — relation/cascade logic unit tests**: `lib/db/repositories/__tests__/{playgrounds,users,templateFiles}.test.ts`.
  Covers the manually-reimplemented `include`/`select` joins, the
  `upsertTemplateFileForPlayground` branch logic, and asserts cascade-delete
  *order* (dependents before parent) for both `deletePlaygroundCascade` and
  `deleteUserCascade`. Also transport-independent — these mock the `DbClient`
  interface, not the driver directly, so they needed only a type-name update.
- **6c (integration) — scaffolding only, NOT run**: `lib/db/__tests__/integration/mongoClient.integration.test.ts`
  + `npm run test:integration` (separate `vitest.integration.config.ts`, excluded
  from the default `npm test`, auto-loads `.env` via `dotenv/config`).
  `DATABASE_URL`/`MONGODB_DATABASE` are genuinely available now (unlike the
  Data API phase), but I have not run this myself — it performs real writes/
  deletes against whatever database `DATABASE_URL` points at, and I don't run
  operations against a user's live database without being asked to. Skips
  cleanly (exit 0) when env vars are unset; confirmed the `dotenv` wiring
  loads them correctly without executing the suite. Someone should run
  `npm run test:integration` (ideally against a disposable test database, not
  a shared/production one) and confirm it passes before treating this as
  verified end-to-end.
- **6d — regression guard**: see `lib/db/REGRESSION_GUARD.md` — now covers
  both why "the WebContainer hang can't recur" isn't an honest claim
  (DevPilot's own DB calls never ran inside WebContainer) *and* the
  architecture-pivot history (Data API removed for new Atlas accounts, native
  driver reinstated). The old `no-tcp-driver.test.ts` guard was deleted — it
  would now permanently and incorrectly fail, since using `mongodb` is
  intentional again. Replaced by `lib/db/__tests__/client-boundary.test.ts`,
  which statically scans every `"use client"` file under `app/`/`modules/`/
  `components/` for a direct import of `lib/db/mongoClient` or
  `lib/db/repositories/*`, backed by `import "server-only"` in
  `mongoClient.ts` as the authoritative, Next.js-build-time enforcement
  (aliased to a no-op shim for vitest — see
  `lib/db/__tests__/server-only-shim.ts`).
- **6e — CI wiring**: `.github/workflows/ci.yml` runs `tsc --noEmit` + `npm test`
  on every push/PR (this repo had no CI before this migration).
  `.github/workflows/integration.yml` is manual-dispatch-only and reads
  `DATABASE_URL`/`MONGODB_DATABASE` from repository secrets that have not
  been configured — documented as a prerequisite, not assumed to exist.
- **6f — final verification**: `npx tsc --noEmit` clean, `npm test` green
  (162 tests / 9 files), repo-wide grep confirms zero remaining
  `@prisma/client`/`prisma`/`@auth/prisma-adapter` imports or dependencies,
  and zero remaining `dataApiClient`/Data-API-specific env vars outside this
  doc's own prose, and all 31 inventoried call sites above are migrated.

## Why

Prisma's query engine talks to MongoDB over the native wire protocol (a real
TCP/`mongodb+srv` socket) regardless of which connector is configured — the
original motivation for moving off it. Whether raw TCP is actually
unavailable in DevPilot's own execution context turned out to be a more
nuanced question than the original ticket assumed: DevPilot's own DB calls
run in a real Next.js Node.js server process (Server Actions/route
handlers), not inside the WebContainer sandbox, so TCP was never actually
blocked for this specific code path. See `REGRESSION_GUARD.md` for the full
reasoning. The user chose to migrate off Prisma anyway for portability/
architecture reasons; the *transport* has since gone Prisma → Atlas Data API
(HTTPS) → native `mongodb` driver (TCP again) per the "Architecture pivot"
section above, landing back on TCP but via the official driver instead of an
ORM.

## Schema audit (`prisma/schema.prisma`)

Single datasource, `provider = "mongodb"` — no mixed-DB scoping needed, every
model below is in scope. All ids are `String @id @default(cuid()) @map("_id")`
— Prisma generates the cuid client-side before insert, so the new layer must
do the same (`@paralleldrive/cuid2`), not rely on Mongo's own `_id` ObjectId
generation.

**Important Mongo-specific catch**: `onDelete: Cascade` on a MongoDB
datasource is *not* a native database feature — Mongo has no FK constraints.
Prisma's query engine implements it at the application level: deleting a
parent triggers the engine to separately delete every dependent document
first. Removing Prisma removes this for free — every cascade below must be
manually reimplemented in the new repository layer, in dependency order, or
deleting a User/Playground will orphan its children.

| Model | Fields | Relations | Cascade children (must reimplement) |
|---|---|---|---|
| `User` | name, email (`@unique`), image, role (enum `UserRole`, default `USER`), createdAt, updatedAt | accounts, myPlaground, staredPlayground, chatMessages | `Account` (userId), `Playground` (userId), `StarMark` (userId), `ChatMessage` (userId) |
| `Account` | userId, type, provider, providerAccountId, refreshToken, accessToken, expiresAt, tokenType, scope, idToken, sessionState | user (Cascade) | — (leaf) |
| `Playground` | title, description, template (enum `Templates`, default `NODE`), githubRepo, githubBranch, githubBaseContent, createdAt, updatedAt, userId | user (Cascade), Starmark, templateFiles, envVars | `StarMark` (playgroundId), `TemplateFile` (playgroundId), `PlaygroundEnvVar` (playgroundId) |
| `PlaygroundEnvVar` | playgroundId, key, value, createdAt, updatedAt. `@@unique([playgroundId, key])` | playground (Cascade) | — (leaf) |
| `StarMark` | userId, playgroundId, isMarked, createdAt. `@@unique([userId, playgroundId])` → compound key `userId_playgroundId` | user (Cascade), playground (Cascade) | — (leaf) |
| `TemplateFile` | content (Json), createdAt, updatedAt, playgroundId (`@unique` — 1:1 with Playground) | playground (Cascade) | — (leaf) |
| `ChatMessage` | userId, role, content, createdAt | user (Cascade) | — (leaf). **Zero call sites found anywhere in the app** — the AI chat feature (`app/api/chat/route.ts`) keeps history in React state only and never touches this table. Repository function will exist for completeness but nothing calls it; no migration risk here. |

No `$transaction`, `$use` middleware, `aggregate`, `groupBy`, or `.count()`
usage anywhere in the app — confirmed by repo-wide grep. Scope is limited to
plain CRUD + two `include`/`select` relation reads + two cascades.

## Call-site inventory

| # | File | Call | Shape | Replacement |
|---|---|---|---|---|
| 1 | `auth.ts:15` | `db.user.findUnique({ where: { email } })` | plain | `findOne("User", {email})` |
| 2 | `auth.ts:20` | `db.user.create({ data: {..., accounts: { create: {...} } } })` | nested create (User + Account in one call) | `insertOne("User", ...)` then `insertOne("Account", {userId: newUser._id, ...})` |
| 3 | `auth.ts:45` | `db.account.findUnique({ where: { provider_providerAccountId } })` | compound unique | `findOne("Account", {provider, providerAccountId})` |
| 4 | `auth.ts:64` | `db.account.create({ data: {...} })` | plain | `insertOne("Account", ...)` |
| 5 | `app/api/template/[id]/route.ts:29` | `db.playground.findUnique({ where: { id } })` | plain, full doc | `findOne("Playground", {_id})` |
| 6 | `modules/playground/actions/index.ts:10` | `db.playground.findUnique({ select: { title, githubRepo, githubBranch, templateFiles: { select: { content } } } })` | **relation read** | `findOne("Playground", {_id})` + `find("TemplateFile", {playgroundId})`, merge |
| 7 | `modules/playground/actions/index.ts:34` | `db.templateFile.upsert({ where: { playgroundId }, update, create })` | upsert | `findOne` then `updateOne` or `insertOne` |
| 8 | `modules/playground/actions/env.ts:10` | `db.playground.findUnique({ select: { userId } })` | plain, projected | `findOne("Playground", {_id}, {projection:{userId:1}})` |
| 9 | `modules/playground/actions/env.ts:29` | `db.playgroundEnvVar.findMany({ select: { key, value } })` | plain list | `find("PlaygroundEnvVar", {playgroundId})` |
| 10 | `modules/playground/actions/env.ts:51` | `db.playgroundEnvVar.deleteMany({ where: { playgroundId } })` | plain | `deleteMany("PlaygroundEnvVar", {playgroundId})` |
| 11 | `modules/playground/actions/env.ts:53` | `db.playgroundEnvVar.createMany({ data: [...] })` | bulk insert | `insertMany("PlaygroundEnvVar", [...])` |
| 12 | `modules/playground/actions/commit.ts:69` | `db.playground.findUnique({ select: {githubRepo, githubBranch, githubBaseContent, userId} })` | projected | `findOne` + projection |
| 13 | `modules/playground/actions/commit.ts:105,359,417` | `db.playground.findUnique({ include: { templateFiles: { select: { content } } } })` (×3, same shape) | **relation read** | `findOne("Playground")` + `find("TemplateFile", {playgroundId})`, merge |
| 14 | `modules/playground/actions/commit.ts:121` | `db.account.findFirst({ where: {userId, provider}, select: {accessToken} })` | projected | `findOne("Account", {userId, provider}, {projection:{accessToken:1}})` |
| 15 | `modules/playground/actions/commit.ts:268` | `db.playground.update({ where:{id}, data:{githubBaseContent} })` | plain | `updateOne("Playground", {_id}, {$set:{githubBaseContent}})` |
| 16 | `modules/playground/actions/commit.ts:446` | `db.templateFile.update({ where:{playgroundId}, data:{content} })` | plain (unique non-id key) | `updateOne("TemplateFile", {playgroundId}, {$set:{content}})` |
| 17 | `modules/auth/actions/index.ts:34` | `db.user.findUnique({ where:{id}, include:{accounts:true} })` | **relation read** + retry wrapper | `findOne("User", {_id})` + `find("Account", {userId})`, merge; keep retry wrapper |
| 18 | `modules/auth/actions/index.ts:50` | `db.account.findFirst({ where:{userId} })` | plain + retry wrapper | `findOne("Account", {userId})` |
| 19 | `modules/auth/actions/index.ts:71` | `db.account.findMany({ where:{userId} })` | plain list | `find("Account", {userId})` |
| 20 | `modules/auth/actions/index.ts:84` | `db.account.delete({ where:{id} })` | plain | `deleteOne("Account", {_id})` |
| 21 | `modules/dashboard/actions/github.ts:38,64,129,183` | `db.account.findFirst({ where:{userId,provider:"github"} })` (×4, same shape, different projections) | plain, projected | `findOne("Account", {userId, provider})` + projection |
| 22 | `modules/dashboard/actions/github.ts:255` | `db.playground.create({ data:{..., templateFiles:{create:{content}}} })` | nested create (Playground + TemplateFile in one call) | `insertOne("Playground", ...)` then `insertOne("TemplateFile", {playgroundId, content})` |
| 23 | `modules/dashboard/actions/index.ts:19` | `db.starMark.create({ data:{userId,playgroundId,isMarked} })` | plain | `insertOne("StarMark", ...)` |
| 24 | `modules/dashboard/actions/index.ts:27` | `db.starMark.delete({ where:{userId_playgroundId:{userId,playgroundId}} })` | compound unique | `deleteOne("StarMark", {userId, playgroundId})` |
| 25 | `modules/dashboard/actions/index.ts:50` | `db.playground.findMany({ where:{userId}, include:{user:true, Starmark:{where:{userId},select:{isMarked}}} })` | **relation read**, nested filtered relation | `find("Playground", {userId})` + `findOne("User")` + `find("StarMark", {userId, playgroundId:{$in:[...]}})`, merge |
| 26 | `modules/dashboard/actions/index.ts:86` | `db.playground.findFirst({ where:{userId,title} })` | plain | `findOne("Playground", {userId, title})` |
| 27 | `modules/dashboard/actions/index.ts:97` | `db.playground.create({ data:{...} })` | plain | `insertOne("Playground", ...)` |
| 28 | `modules/dashboard/actions/index.ts:115` | `db.playground.delete({ where:{id} })` | plain — **cascade** (StarMark, TemplateFile, PlaygroundEnvVar) | `deleteOne("Playground", {_id})` + manual cascade |
| 29 | `modules/dashboard/actions/index.ts:131` | `db.playground.update({ where:{id}, data })` | plain | `updateOne("Playground", {_id}, {$set:data})` |
| 30 | `modules/dashboard/actions/index.ts:145` | `db.playground.findUnique({ where:{id} })` | plain, full doc | `findOne("Playground", {_id})` |
| 31 | `modules/dashboard/actions/index.ts:153` | `db.playground.create({ data:{...} })` | plain | `insertOne("Playground", ...)` |

Not yet ported (deferred, see "Deferred / not touched" below): none — all 31
call sites above are in scope.

## Deferred / not touched
- `ChatMessage` repository: build the function for completeness (schema
  parity) but it has no caller; not a source of regression risk either way.
- `User.delete` cascade (Account/Playground/StarMark/ChatMessage): no call
  site anywhere deletes a `User` document today (only `Account.delete` via
  `disconnectProvider`, which is one linked provider, not the user). Cascade
  function still built and tested for correctness, but there's no existing
  caller to wire it into.

## Gaps that could NOT be cleanly replicated (must be covered by a test proving the gap is closed or accepted)
1. **Uniqueness enforcement** (`User.email @unique`, `Account.[provider,providerAccountId] @unique`,
   `PlaygroundEnvVar.[playgroundId,key] @unique`, `StarMark.[userId,playgroundId] @unique`,
   `TemplateFile.playgroundId @unique`) — still not enforced server-side by
   this app's code. Unlike Data API, the native driver *can* technically
   create indexes programmatically (`collection.createIndex(...,{unique:true})`),
   but doing so wasn't in scope here and I haven't run it — it's a real,
   hard-to-reverse schema change against your live cluster, not something to
   do silently as a side effect of an app-code migration. **Action required
   of the user**: create these 4 unique indexes directly in Atlas (or ask me
   to run `createIndex` explicitly, now that the native driver makes that
   possible, if you'd rather do it that way than through the Atlas UI). Until
   then, the validation layer's pre-write existence check (`findOne` before
   `insertOne`) is the only enforcement, and it is race-prone (TOCTOU) under
   concurrent requests — a known, accepted gap.
2. **cuid ID generation** timing — Prisma generated `_id` before insert,
   application-side. The new layer does the same explicitly per insert
   (`newId()` in `lib/db/schemas.ts`); missed in any new call site, the
   native driver would auto-generate a BSON ObjectId instead (unlike Data
   API, which had the same auto-generate-if-omitted behavior) — either way
   breaking every relation lookup by cuid string. Covered by a validation
   test requiring the id field present on every insert payload.
3. **Retry-on-connection-error wrapper** (`modules/auth/actions/index.ts`'s
   `retryQuery`) — originally tuned for Prisma's TCP disconnect strings, then
   retargeted to HTTP 429/5xx during the Data API phase, now retargeted again
   to `DbError.retryable` (`lib/db/mongoClient.ts`), which classifies by
   driver error name (`MongoNetworkError`, `MongoServerSelectionError`) or
   error label (`TransientTransactionError`, `RetryableWriteError`) — the
   actual transient-failure signals a TCP driver produces, not an HTTP status.
