import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";

/**
 * Runtime validation replacing what Prisma's schema.prisma previously
 * enforced (required fields, @unique, enum values, @default) — Data API
 * enforces nothing server-side, so this is the only remaining safety net.
 * Every schema below is intended to be a 1:1 match of the corresponding
 * `model` block; see MIGRATION_INVENTORY.md for the source-of-truth table
 * and the one accepted gap (uniqueness needs an Atlas-side index too, since
 * neither Data API nor this validation layer can enforce it atomically).
 */

/** Same id shape Prisma's `@default(cuid())` produced — generate explicitly before every insert. */
export const newId = () => createId();

export const UserRoleSchema = z.enum(["ADMIN", "USER", "PREMIUM_USER"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const TemplatesSchema = z.enum(["REACT", "NEXTJS", "EXPRESS", "VUE", "HONO", "ANGULAR", "NODE"]);
export type Templates = z.infer<typeof TemplatesSchema>;

// ---- User ----
// Read-side schemas use `.nullable()` (not `.nullish()`): a field written by
// a create function below is always present on the wire doc, just possibly
// `null` — matching Prisma's original `string | null` contract that every
// existing UI component expects. `.nullish()` is reserved for *CreateInput*
// schemas, where the caller may genuinely omit the key.
export const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().email(),
  image: z.string().nullable(),
  role: UserRoleSchema.default("USER"),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const UserCreateInputSchema = z.object({
  name: z.string().nullish(),
  email: z.string().email(),
  image: z.string().nullish(),
  role: UserRoleSchema.default("USER"),
});
export type UserCreateInput = z.input<typeof UserCreateInputSchema>;

// ---- Account ----
export const AccountSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: z.string().min(1),
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
  refreshToken: z.string().nullable(),
  accessToken: z.string().nullable(),
  expiresAt: z.number().int().nullable(),
  tokenType: z.string().nullable(),
  scope: z.string().nullable(),
  idToken: z.string().nullable(),
  sessionState: z.string().nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountCreateInputSchema = z.object({
  userId: z.string().min(1),
  type: z.string().min(1),
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
  refreshToken: z.string().nullish(),
  accessToken: z.string().nullish(),
  expiresAt: z.number().int().nullish(),
  tokenType: z.string().nullish(),
  scope: z.string().nullish(),
  idToken: z.string().nullish(),
  sessionState: z.string().nullish(),
});
export type AccountCreateInput = z.input<typeof AccountCreateInputSchema>;

// ---- Playground ----
export const PlaygroundSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  template: TemplatesSchema.default("NODE"),
  githubRepo: z.string().nullable(),
  githubBranch: z.string().nullable(),
  githubBaseContent: z.string().nullable(),
  /** Folder path (from tree root, exclusive) the project's ".env" file lives in — see PlaygroundEnvVar. Null/absent means root, or never set (legacy docs). */
  envFilePath: z.array(z.string()).nullable(),
  userId: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Playground = z.infer<typeof PlaygroundSchema>;

export const PlaygroundCreateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  template: TemplatesSchema.default("NODE"),
  githubRepo: z.string().nullish(),
  githubBranch: z.string().nullish(),
  githubBaseContent: z.string().nullish(),
  envFilePath: z.array(z.string()).nullish(),
  userId: z.string().min(1),
});
export type PlaygroundCreateInput = z.input<typeof PlaygroundCreateInputSchema>;

// ---- PlaygroundEnvVar ----
export const PlaygroundEnvVarSchema = z.object({
  id: z.string().min(1),
  playgroundId: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PlaygroundEnvVar = z.infer<typeof PlaygroundEnvVarSchema>;

export const PlaygroundEnvVarCreateInputSchema = z.object({
  playgroundId: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
});
export type PlaygroundEnvVarCreateInput = z.infer<typeof PlaygroundEnvVarCreateInputSchema>;

// ---- StarMark ----
export const StarMarkSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  playgroundId: z.string().min(1),
  isMarked: z.boolean(),
  createdAt: z.date(),
});
export type StarMark = z.infer<typeof StarMarkSchema>;

export const StarMarkCreateInputSchema = z.object({
  userId: z.string().min(1),
  playgroundId: z.string().min(1),
  isMarked: z.boolean(),
});
export type StarMarkCreateInput = z.infer<typeof StarMarkCreateInputSchema>;

// ---- TemplateFile ----
export const TemplateFileSchema = z.object({
  id: z.string().min(1),
  content: z.unknown(),
  playgroundId: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TemplateFile = z.infer<typeof TemplateFileSchema>;

export const TemplateFileCreateInputSchema = z.object({
  playgroundId: z.string().min(1),
  content: z.unknown(),
});
export type TemplateFileCreateInput = z.infer<typeof TemplateFileCreateInputSchema>;

// ---- AgentRun ----
// Autonomous coding-agent task runs (see lib/ai/agent/orchestrator.ts). One
// document per run; the activity log is embedded so the live panel and any
// later "what happened" review read from a single doc, no join needed.
export const AgentRunStatusSchema = z.enum([
  "running",
  "completed",
  "blocked",
  "capped",
  "stopped",
  "failed",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRunLogEntrySchema = z.object({
  ts: z.date(),
  type: z.enum(["status", "model", "tool_call", "tool_result", "checkpoint", "error"]),
  message: z.string(),
  detail: z.unknown().nullish(),
});
export type AgentRunLogEntry = z.infer<typeof AgentRunLogEntrySchema>;

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  playgroundId: z.string().min(1),
  userId: z.string().min(1),
  task: z.string().min(1),
  status: AgentRunStatusSchema,
  log: z.array(AgentRunLogEntrySchema),
  iterationCount: z.number().int().default(0),
  toolCallCount: z.number().int().default(0),
  approxTokens: z.number().int().default(0),
  /** Set as soon as a Stop is requested; the loop polls this between steps and
   *  halts at the next safe boundary rather than mid tool-call. */
  stopRequested: z.boolean().default(false),
  checkpointBeforeId: z.string().nullable(),
  checkpointAfterId: z.string().nullable(),
  summary: z.string().nullable(),
  blockedReason: z.string().nullable(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const AgentRunCreateInputSchema = z.object({
  playgroundId: z.string().min(1),
  userId: z.string().min(1),
  task: z.string().min(1),
});
export type AgentRunCreateInput = z.infer<typeof AgentRunCreateInputSchema>;

// ---- ProjectCheckpoint ----
// Short-term rollback safety net for the autonomous agent (lib/checkpoint/store.ts)
// — the sole safety net for a mode that auto-applies every file edit with no
// pause gate, so this lives in the same durable database as the actual
// project files, not a cache-oriented store. A single embedded document per
// checkpoint (files array inline): the live project store this snapshots is
// itself already one Mongo document per project capped at 16MB, so a
// checkpoint can never exceed what already fits there. Expiry is a TTL index
// on `createdAt` (see scripts/ensure-checkpoint-indexes.ts) — MongoDB's TTL
// background monitor runs roughly every 60s, so a checkpoint may remain
// readable up to ~60s past its nominal TTL. That's accepted as-is, not
// worked around with exact-time filtering in application code.
export const ProjectCheckpointFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["base64"]).nullish(),
});
export type ProjectCheckpointFile = z.infer<typeof ProjectCheckpointFileSchema>;

export const ProjectCheckpointSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  label: z.string(),
  reason: z.string(),
  rootFolderName: z.string(),
  files: z.array(ProjectCheckpointFileSchema),
  createdAt: z.date(),
});
export type ProjectCheckpoint = z.infer<typeof ProjectCheckpointSchema>;

export const ProjectCheckpointCreateInputSchema = z.object({
  projectId: z.string().min(1),
  label: z.string(),
  reason: z.string(),
  rootFolderName: z.string(),
  files: z.array(ProjectCheckpointFileSchema),
});
export type ProjectCheckpointCreateInput = z.infer<typeof ProjectCheckpointCreateInputSchema>;

// ---- ChatMessage ----
// No call sites reference this model anywhere in the app (see
// MIGRATION_INVENTORY.md) — kept for schema parity only.
export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  role: z.string().min(1),
  content: z.string(),
  createdAt: z.date(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatMessageCreateInputSchema = z.object({
  userId: z.string().min(1),
  role: z.string().min(1),
  content: z.string(),
});
export type ChatMessageCreateInput = z.infer<typeof ChatMessageCreateInputSchema>;
