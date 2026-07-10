/**
 * Startup check for the auth env vars NextAuth v5 (installed here — see
 * package.json) actually reads: AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET,
 * AUTH_SECRET (see auth.config.ts / auth.ts). Booleans only, never values —
 * this exists specifically so a missing var fails loudly at startup instead
 * of surfacing as NextAuth's generic "Configuration" error page later.
 */
const REQUIRED_AUTH_ENV_VARS = [
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
] as const;

export interface AuthEnvCheckResult {
  present: string[];
  missing: string[];
  ok: boolean;
}

export function checkAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnvCheckResult {
  const present: string[] = [];
  const missing: string[] = [];
  for (const key of REQUIRED_AUTH_ENV_VARS) {
    if (env[key]) present.push(key);
    else missing.push(key);
  }
  return { present, missing, ok: missing.length === 0 };
}

export function logAuthEnvStatus(env: NodeJS.ProcessEnv = process.env): AuthEnvCheckResult {
  const result = checkAuthEnv(env);
  if (result.ok) {
    console.log(`[auth] Loaded env vars: ${result.present.join(", ")}`);
  } else {
    console.warn(
      `[auth] Missing required env vars: ${result.missing.join(", ")} ` +
        `(present: ${result.present.join(", ") || "none"}). ` +
        `NextAuth will throw a generic "Configuration" error at sign-in until these are set.`
    );
  }
  return result;
}
