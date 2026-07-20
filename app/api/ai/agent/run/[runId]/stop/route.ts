import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/actions";
import { findAgentRunById, setAgentRunStopRequested } from "@/lib/db/repositories/agentRuns";
import { requestStop } from "@/lib/ai/agent/relay";

export const runtime = "nodejs";

/**
 * The kill switch. Sets an in-memory flag (relay.ts) the orchestrator loop
 * polls at the next safe boundary (between tool calls, never mid-write), and
 * — since that boundary can otherwise be minutes away, mid a long
 * `run_command` or a rate-limit backoff — also actively aborts whatever the
 * loop is currently awaiting (in-flight model fetch, pacing wait, pending
 * browser command) so it unblocks immediately. Either way the loop then runs
 * its normal post-loop checkpoint commit and ends the run as "stopped".
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { runId } = await params;
  const run = await findAgentRunById(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.userId !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (run.status !== "running") {
    return NextResponse.json({ ok: true, message: "Run already finished." });
  }

  requestStop(runId);
  await setAgentRunStopRequested(runId);

  return NextResponse.json({ ok: true });
}
