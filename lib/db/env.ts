/**
 * Startup check for the MongoDB driver env vars — logs which are actually
 * present rather than assuming they were written to disk for this project's
 * folder (a known env-sync gap). Called once from instrumentation.ts's
 * register() at server boot; also exported directly so it can be unit tested
 * without needing a running server.
 */
const REQUIRED_DB_ENV_VARS = ["DATABASE_URL", "MONGODB_DATABASE"] as const;

export interface DbEnvCheckResult {
  present: string[];
  missing: string[];
  ok: boolean;
}

export function checkDbEnv(env: NodeJS.ProcessEnv = process.env): DbEnvCheckResult {
  const present: string[] = [];
  const missing: string[] = [];
  for (const key of REQUIRED_DB_ENV_VARS) {
    if (env[key]) present.push(key);
    else missing.push(key);
  }
  return { present, missing, ok: missing.length === 0 };
}

export function logDbEnvStatus(env: NodeJS.ProcessEnv = process.env): DbEnvCheckResult {
  const result = checkDbEnv(env);
  if (result.ok) {
    console.log(`[mongoClient] Loaded env vars: ${result.present.join(", ")}`);
  } else {
    console.warn(
      `[mongoClient] Missing required env vars: ${result.missing.join(", ")} ` +
        `(present: ${result.present.join(", ") || "none"}). ` +
        `Database calls will throw until these are set — see .env and lib/db/MIGRATION_INVENTORY.md.`
    );
  }
  return result;
}
