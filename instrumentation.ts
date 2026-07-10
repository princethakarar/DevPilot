export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logDbEnvStatus } = await import("./lib/db/env");
    logDbEnvStatus();
    const { logAuthEnvStatus } = await import("./lib/auth/env");
    logAuthEnvStatus();
  }
}
