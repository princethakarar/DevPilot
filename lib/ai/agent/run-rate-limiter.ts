import { findActiveAgentRuns, countAgentRunsSince } from "@/lib/db/repositories/agentRuns";

/**
 * Autonomous runs are expensive (model calls + a live WebContainer round trip
 * per command) — capped explicitly rather than queued silently, per spec.
 * Backed by the AgentRun collection (not an in-memory counter) since a run's
 * lifetime spans many requests/minutes and needs to survive a redeploy.
 */
export const AGENT_RUN_LIMITS = {
  maxConcurrentPerUser: 1,
  maxRunsPerHourPerUser: 8,
} as const;

export interface RunAllowedCheck {
  allowed: boolean;
  reason?: string;
}

export async function checkAgentRunAllowed(userId: string, playgroundId: string): Promise<RunAllowedCheck> {
  const [activeForUser, activeForProject, recentCount] = await Promise.all([
    findActiveAgentRuns({ userId }),
    findActiveAgentRuns({ playgroundId }),
    countAgentRunsSince(userId, new Date(Date.now() - 60 * 60 * 1000)),
  ]);

  if (activeForProject.length > 0) {
    return { allowed: false, reason: "This project already has an autonomous task running. Stop it or wait for it to finish before starting another." };
  }
  if (activeForUser.length >= AGENT_RUN_LIMITS.maxConcurrentPerUser) {
    return { allowed: false, reason: `You already have ${activeForUser.length} autonomous task(s) running. Wait for one to finish before starting another.` };
  }
  if (recentCount >= AGENT_RUN_LIMITS.maxRunsPerHourPerUser) {
    return { allowed: false, reason: `You've hit the limit of ${AGENT_RUN_LIMITS.maxRunsPerHourPerUser} autonomous task runs per hour. Try again later.` };
  }
  return { allowed: true };
}
