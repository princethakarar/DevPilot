import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/actions";
import { findAgentRunById } from "@/lib/db/repositories/agentRuns";
import { resolveBrowserCommand } from "@/lib/ai/agent/relay";

export const runtime = "nodejs";

/**
 * Companion endpoint to the run's SSE stream: the browser tab posts back the
 * result of a run_command it just executed in its live WebContainer, which
 * resumes the paused server-side orchestrator loop (see relay.ts).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { runId } = await params;
  const run = await findAgentRunById(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.userId !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  let body: { callId?: string; stdout?: string; stderr?: string; exitCode?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { callId, stdout, stderr, exitCode } = body;
  if (!callId || typeof callId !== "string") {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  const resolved = resolveBrowserCommand(runId, callId, {
    stdout: typeof stdout === "string" ? stdout : "",
    stderr: typeof stderr === "string" ? stderr : "",
    exitCode: typeof exitCode === "number" ? exitCode : 1,
  });

  if (!resolved) {
    // Not an error the caller needs to retry on — most likely the wait already
    // timed out server-side (browser was slow), or this call was already resolved.
    return NextResponse.json({ ok: false, message: "No pending call for this callId (already resolved or timed out)." });
  }

  return NextResponse.json({ ok: true });
}
