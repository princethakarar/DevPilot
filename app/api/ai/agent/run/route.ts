import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/actions";
import { findPlaygroundById } from "@/lib/db/repositories/playgrounds";
import { createAgentRun } from "@/lib/db/repositories/agentRuns";
import { checkAgentRunAllowed, stopActiveProjectRuns } from "@/lib/ai/agent/run-rate-limiter";
import { registerRunEmitter, unregisterRunEmitter, clearStop, type RelayEvent } from "@/lib/ai/agent/relay";
import { runAgentOrchestrator } from "@/lib/ai/agent/orchestrator";

// Long-running (up to the 5-minute agent cap) SSE response — must run on the
// real Node.js server, never an edge runtime.
export const runtime = "nodejs";

const MAX_TASK_LENGTH = 4000;

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { projectId?: string; task?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, task } = body;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!task || typeof task !== "string" || !task.trim()) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }
  if (task.length > MAX_TASK_LENGTH) {
    return NextResponse.json({ error: `task must be under ${MAX_TASK_LENGTH} characters` }, { status: 400 });
  }

  const playground = await findPlaygroundById(projectId, { projection: { userId: 1 } });
  if (!playground) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (playground.userId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  // No linked-repo precondition here: checkpointing now runs entirely on the
  // Redis-backed store (lib/checkpoint/store.ts), which doesn't depend on
  // GitHub at all.

  // Starting a new task for this project supersedes any task already running
  // for it, rather than making the user manually stop-then-retry — see
  // stopActiveProjectRuns' doc comment. checkAgentRunAllowed's own
  // activeForProject check stays in place right after as a safety net for
  // the (rare, timeout) case this couldn't clear it.
  const previousRunsStopped = await stopActiveProjectRuns(projectId);
  if (!previousRunsStopped) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Couldn't stop the previous task in time — try again in a moment." },
      { status: 429 }
    );
  }

  const rateCheck = await checkAgentRunAllowed(user.id, projectId);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED", message: rateCheck.reason }, { status: 429 });
  }

  const run = await createAgentRun({ playgroundId: projectId, userId: user.id, task: task.trim() });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const emit = (event: RelayEvent) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      };
      registerRunEmitter(run.id, emit);

      // Heartbeat so intermediaries (proxies, the browser fetch reader) don't
      // treat a long "thinking"/build gap as a dead connection.
      const heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), 15_000);

      runAgentOrchestrator({ runId: run.id, playgroundId: projectId, task: task.trim() })
        .catch(() => {
          // runAgentOrchestrator itself never throws (see its own try/catch) —
          // this is only a last-resort guard.
        })
        .finally(() => {
          clearInterval(heartbeat);
          unregisterRunEmitter(run.id);
          clearStop(run.id);
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by client disconnect
          }
        });
    },
    cancel() {
      unregisterRunEmitter(run.id);
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Run-Id": run.id,
    },
  });
}
