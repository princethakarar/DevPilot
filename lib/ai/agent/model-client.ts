import { AGENT_TOOLS } from "./tools";

/**
 * Model chosen for the autonomous loop after a live head-to-head test against
 * a deliberately-buggy fix-and-verify scenario (see conversation/PR notes):
 * qwen/qwen3-32b was the only one of three Groq-hosted candidates that
 * reliably completed read -> write -> verify -> mark_complete without a
 * malformed tool call or silently stopping short of signaling done. Reuses
 * the existing GROQ_API_KEY — no new provider/billing setup needed.
 */
const DEFAULT_AGENT_MODEL = "qwen/qwen3-32b";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface AgentModelResult {
  message: AgentModelMessage;
  toolCalls: AgentToolCall[];
  approxTokens: number;
}

export class AgentModelError extends Error {}

/**
 * Groq returns two distinct error shapes when a request bumps into the TPM
 * (tokens-per-minute) budget, and they need different responses:
 *  - "rate_limited" (usually 429): cumulative usage over the current time
 *    window is exhausted. The error message includes a concrete wait
 *    ("Please try again in 10.65s") — waiting that long and resending the
 *    SAME request is a valid fix.
 *  - "too_large" (usually 413, "Request too large... reduce your message
 *    size"): THIS single request's token count exceeds the entire TPM
 *    budget outright, regardless of timing. Waiting and resending the
 *    identical payload will fail again every time — the only fix is
 *    shrinking the request itself before retrying.
 * Distinguished by message content, not just status code, since Groq has
 * used 413 for both request-too-large and (historically) other cases.
 */
export class AgentRateLimitError extends AgentModelError {
  readonly kind: "too_large" | "rate_limited";
  readonly waitSeconds: number | null;

  constructor(kind: "too_large" | "rate_limited", waitSeconds: number | null, message: string) {
    super(message);
    this.kind = kind;
    this.waitSeconds = waitSeconds;
  }
}

function parseRateLimitInfo(bodyText: string, retryAfterHeader: string | null): { kind: "too_large" | "rate_limited"; waitSeconds: number | null; message: string } {
  let message = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) message = parsed.error.message;
  } catch {
    // Not JSON — use the raw body text as the message.
  }

  const waitMatch = message.match(/try again in ([\d.]+)s/i);
  const parsedWait = waitMatch ? parseFloat(waitMatch[1]) : null;
  const headerWait = retryAfterHeader ? Number(retryAfterHeader) : null;
  const waitSeconds = parsedWait ?? (headerWait !== null && Number.isFinite(headerWait) ? headerWait : null);

  const tooLarge = /request too large|reduce your message size/i.test(message);
  return { kind: tooLarge ? "too_large" : "rate_limited", waitSeconds, message };
}

/**
 * Single-turn call to the agent model with the fixed tool schema. Not
 * streamed — the orchestrator needs the complete tool_calls array to route,
 * not a token stream; live progress is communicated to the frontend via the
 * orchestrator's own SSE events, not raw model output.
 */
export async function callAgentModel(messages: AgentModelMessage[]): Promise<AgentModelResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AgentModelError("GROQ_API_KEY is not configured in the environment.");
  }
  const model = process.env.AGENT_GROQ_MODEL || DEFAULT_AGENT_MODEL;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    if (response.status === 429 || response.status === 413) {
      const info = parseRateLimitInfo(bodyText, response.headers.get("retry-after"));
      throw new AgentRateLimitError(info.kind, info.waitSeconds, info.message);
    }
    throw new AgentModelError(`Agent model request failed (${response.status}): ${bodyText.slice(0, 500)}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new AgentModelError("Agent model returned no message.");
  }

  const toolCalls: AgentToolCall[] = (message.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}");
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });

  // Groq reports usage when available; fall back to a char/4 estimate over the
  // request+response text so the run always has a cost signal even if the
  // provider omits usage on some responses.
  const approxTokens: number =
    data.usage?.total_tokens ??
    Math.ceil((JSON.stringify(messages).length + JSON.stringify(message).length) / 4);

  return { message, toolCalls, approxTokens };
}
