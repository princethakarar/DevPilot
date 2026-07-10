/**
 * Actual MongoDB collection names. Prisma's MongoDB connector uses the exact
 * model name as the collection name unless `@@map(...)` is set — and none of
 * the models in schema.prisma use it — so these match 1:1.
 */
export const COLLECTIONS = {
  User: "User",
  Account: "Account",
  Playground: "Playground",
  PlaygroundEnvVar: "PlaygroundEnvVar",
  StarMark: "StarMark",
  TemplateFile: "TemplateFile",
  ChatMessage: "ChatMessage",
} as const;
