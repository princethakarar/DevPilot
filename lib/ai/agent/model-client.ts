import { AGENT_TOOLS } from "./tools";
import { estimateRequestTokens, waitForTokenBudget, reserveEstimate, finalizeReservation, releaseReservation } from "./token-budget";

/**
 * Default model for the autonomous loop. Previously pinned to
 * "qwen/qwen3-32b" after a head-to-head test found it reliably completed
 * read -> write -> verify -> mark_complete without malformed tool calls —
 * but Groq has since removed that model entirely (requests now 404 with
 * "model_not_found"), which broke every agent run until someone noticed and
 * manually redeployed with AGENT_GROQ_MODEL set. Falling back to the same
 * model the plain chat route already uses successfully (app/api/chat/route.ts)
 * — it's confirmed live/accessible with the existing GROQ_API_KEY. Override
 * via AGENT_GROQ_MODEL if Groq deprecates this one too or a better-tested
 * candidate is found.
 */
const DEFAULT_AGENT_MODEL = "llama-3.3-70b-versatile";

/**
 * Automatic fallback for the exact failure class that caused the outage
 * above: rate-limit-retry.ts switches to this model — without waiting for a
 * human to notice and redeploy — when the primary is unavailable
 * (renamed/decommissioned), when it exhausts its rate-limit retries, or when
 * it repeatedly fails to produce a valid tool call. Deliberately a
 * different model, not just a different name for the same one, so a
 * provider-side incident scoped to one model (an outage, a TPM budget that's
 * saturated, a deprecation) doesn't take out the fallback along with it.
 * "llama-3.1-8b-instant" is Groq's smaller, separately-rate-limited Llama
 * model — well-established tool-calling support, and its own TPM budget is
 * untouched by whatever exhausted the primary's. Override via
 * AGENT_GROQ_FALLBACK_MODEL.
 */
const DEFAULT_FALLBACK_AGENT_MODEL = "llama-3.1-8b-instant";

export function resolvePrimaryModel(): string {
  return process.env.AGENT_GROQ_MODEL || DEFAULT_AGENT_MODEL;
}

export function resolveFallbackModel(): string {
  return process.env.AGENT_GROQ_FALLBACK_MODEL || DEFAULT_FALLBACK_AGENT_MODEL;
}

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

/**
 * Groq-specific failure mode distinct from rate limiting: the model itself
 * produced malformed/invalid JSON for a tool call and Groq's own schema
 * validation rejected it before it ever reached us — reported as a 400 with
 * "Failed to call a function. Please adjust your prompt." and (usually) a
 * `failed_generation` field containing the raw text the model tried to emit.
 * Confirmed live to be prompt/turn-dependent, not a permanent per-request
 * failure — the same conversation often succeeds on an immediate retry, so
 * this is handled as a retryable error (see rate-limit-retry.ts) rather than
 * failing the whole run on the first occurrence.
 */
export class AgentToolCallGenerationError extends AgentModelError {
  readonly failedGeneration: string | null;

  constructor(message: string, failedGeneration: string | null) {
    super(message);
    this.failedGeneration = failedGeneration;
  }
}

/**
 * Distinct from the plain AgentModelError so rate-limit-retry.ts can tell
 * "this model is gone/misconfigured" apart from a generic/unexpected
 * failure — retrying the SAME model on this error is pointless (it'll 404
 * again identically), so this is the one failure mode that triggers an
 * immediate fallback-model switch rather than a same-model retry loop.
 */
export class AgentModelUnavailableError extends AgentModelError {}

function parseToolCallGenerationFailure(bodyText: string): { message: string; failedGeneration: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  const error = (parsed as { error?: { message?: string; failed_generation?: string; code?: string } } | undefined)?.error;
  if (!error?.message) return null;

  const isToolCallFailure =
    error.code === "tool_use_failed" || /failed to call a function|adjust your prompt/i.test(error.message);
  if (!isToolCallFailure) return null;

  return { message: error.message, failedGeneration: error.failed_generation ?? null };
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
 * Turns a failed Groq response into a short, actionable message instead of a
 * raw JSON dump, and classifies whether it's a model-availability failure
 * (missing/renamed/decommissioned model — the exact failure mode that broke
 * every agent run when Groq removed qwen/qwen3-32b) so the caller can throw
 * AgentModelUnavailableError and trigger an automatic fallback-model switch
 * (rate-limit-retry.ts) instead of a same-model retry that would just 404
 * again.
 */
function describeModelFailure(status: number, bodyText: string, model: string): { message: string; modelUnavailable: boolean } {
  let providerMessage = bodyText;
  let code: string | undefined;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) providerMessage = parsed.error.message;
    if (parsed?.error?.code) code = parsed.error.code;
  } catch {
    // Not JSON — fall back to the raw body text below.
  }

  const modelUnavailable =
    status === 404 || code === "model_not_found" || /does not exist|no such model|unknown model/i.test(providerMessage);

  if (modelUnavailable) {
    return {
      modelUnavailable: true,
      message: `The configured AI model ("${model}") is not available from the provider — it may have been renamed or decommissioned.`,
    };
  }

  return { modelUnavailable: false, message: `Agent model request failed (${status}): ${providerMessage.slice(0, 500)}` };
}

/**
 * Single-turn call to the agent model with the fixed tool schema. Not
 * streamed — the orchestrator needs the complete tool_calls array to route,
 * not a token stream; live progress is communicated to the frontend via the
 * orchestrator's own SSE events, not raw model output.
 *
 * Before firing, paces against the global token-budget ledger (token-budget.ts)
 * so this call — and every other call in this process, across every run —
 * doesn't fire straight into a 429 that reactive retry would then have to
 * clean up. `onStatus` surfaces both the pacing wait and (via the caller,
 * rate-limit-retry.ts) any reactive retry wait as one continuous live status.
 */
export async function callAgentModel(
  messages: AgentModelMessage[],
  onStatus?: (message: string) => void | Promise<void>,
  stopSignal?: AbortSignal,
  // Defaults to the primary model when omitted (existing single-model call
  // sites, and every test, keep working unchanged) — rate-limit-retry.ts is
  // the only caller that ever passes this explicitly, to route a given
  // attempt at the primary or the fallback model (see resolveFallbackModel).
  model: string = resolvePrimaryModel()
): Promise<AgentModelResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AgentModelError("GROQ_API_KEY is not configured in the environment.");
  }

  const estimate = estimateRequestTokens(messages);
  await waitForTokenBudget(
    estimate,
    async (waitMs) => {
      if (onStatus) await onStatus(`Pacing request — waiting ~${Math.ceil(waitMs / 1000)}s to stay under the AI provider's rate limit…`);
    },
    undefined,
    stopSignal ? () => stopSignal.aborted : undefined
  );
  if (stopSignal?.aborted) throw new AgentModelError("Stopped by user request.");

  const reservationId = reserveEstimate(estimate);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        // write_file's arguments carry a whole file's content as one JSON
        // string field; 2000 was cutting that off mid-generation for
        // anything past a small file, which Groq's own tool-call JSON
        // validation then rejects as "Failed to call a function" — a
        // deterministic failure that retrying the identical request (see
        // rate-limit-retry.ts) can never fix, since the model regenerates
        // the same too-long content and hits the same wall every time.
        // Kept below TPM_LIMIT_ESTIMATE (token-budget.ts) rather than raised
        // to cover every possible file, since a single call's completion
        // competing for most of the whole per-minute budget would just trade
        // this failure mode for constant 413s.
        max_tokens: 4096,
      }),
      // Combined so a user-requested stop (relay.ts's getStopSignal) aborts
      // an in-flight Groq call exactly like a timeout would, instead of the
      // orchestrator loop sitting there for up to 60s after Stop was clicked.
      signal: stopSignal ? AbortSignal.any([AbortSignal.timeout(60_000), stopSignal]) : AbortSignal.timeout(60_000),
    });
  } catch (err) {
    // Never actually reached Groq, so nothing was billed against the window.
    releaseReservation(reservationId);
    throw err;
  }

  if (!response.ok) {
    // A rejected/failed request isn't billed — release, don't finalize, so
    // the ledger reflects real consumption, not attempted consumption.
    releaseReservation(reservationId);
    const bodyText = await response.text().catch(() => "");
    if (response.status === 429 || response.status === 413) {
      const info = parseRateLimitInfo(bodyText, response.headers.get("retry-after"));
      throw new AgentRateLimitError(info.kind, info.waitSeconds, info.message);
    }
    const toolCallFailure = parseToolCallGenerationFailure(bodyText);
    if (toolCallFailure) {
      throw new AgentToolCallGenerationError(toolCallFailure.message, toolCallFailure.failedGeneration);
    }
    const failure = describeModelFailure(response.status, bodyText, model);
    throw failure.modelUnavailable ? new AgentModelUnavailableError(failure.message) : new AgentModelError(failure.message);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) {
    releaseReservation(reservationId);
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

  finalizeReservation(reservationId, approxTokens);
  return { message, toolCalls, approxTokens };
}
