import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/actions";
import { findAgentRunById } from "@/lib/db/repositories/agentRuns";

export const runtime = "nodejs";

/** Snapshot fetch for reload continuity — the SSE stream is the live feed, this is "what's the state right now." */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { runId } = await params;
  const run = await findAgentRunById(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.userId !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({ run });
}
