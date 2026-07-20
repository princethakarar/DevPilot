import { findActiveAgentRuns, countAgentRunsSince, setAgentRunStopRequested } from "@/lib/db/repositories/agentRuns";
import { requestStop } from "./relay";

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

const STOP_POLL_INTERVAL_MS = 300;
const STOP_WAIT_TIMEOUT_MS = 10_000;

/**
 * A project only ever runs one autonomous task at a time (see
 * checkAgentRunAllowed's activeForProject check below) — but starting a new
 * task is itself a clear "I'm done with the old one" signal from the user.
 * Making them manually hit Stop, wait for the run to actually end, and then
 * retry Start is worse than just superseding it. Requests a stop on every
 * active run for this project and polls the DB until each one's status
 * actually clears "running" (same-process, in-memory relay.ts — the
 * orchestrator loop for that run is guaranteed to be in this process),
 * bounded so a run that somehow never stops can't hang the new request
 * forever. Returns false only in that timeout case — the caller should then
 * fail the start rather than risk two runs writing to the same project at
 * once.
 */
export async function stopActiveProjectRuns(
  playgroundId: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<boolean> {
  const active = await findActiveAgentRuns({ playgroundId });
  if (active.length === 0) return true;

  await Promise.all(
    active.map(async (run) => {
      requestStop(run.id);
      await setAgentRunStopRequested(run.id);
    })
  );

  const deadline = Date.now() + STOP_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const stillActive = await findActiveAgentRuns({ playgroundId });
    if (stillActive.length === 0) return true;
    await sleep(STOP_POLL_INTERVAL_MS);
  }
  return (await findActiveAgentRuns({ playgroundId })).length === 0;
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
