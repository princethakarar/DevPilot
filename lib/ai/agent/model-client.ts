import { AGENT_TOOLS } from "./tools";
import {
  estimatePromptTokens,
  estimateBilledTokens,
  waitForTokenBudget,
  reserveEstimate,
  reconcileReservation,
  releaseReservation,
  MAX_COMPLETION_TOKENS,
  CHARS_PER_TOKEN,
} from "./token-budget";
import { recordObservedLimits } from "./model-limits";


/**
 * Default model for the autonomous coding agent loop.
 * Both primary and fallback run on Groq's free tier.
 * Override via AGENT_PRIMARY_MODEL / AGENT_FALLBACK_MODEL env vars.
 */
const DEFAULT_AGENT_MODEL = "openai/gpt-oss-120b";

/**
 * Fallback model on Groq — used by rate-limit-retry.ts when the primary
 * is rate-limited, unavailable, or repeatedly fails tool calls.
 */
const DEFAULT_FALLBACK_AGENT_MODEL = "qwen/qwen3.8-27b";

export function resolvePrimaryModel(): string {
  return process.env.AGENT_PRIMARY_MODEL || DEFAULT_AGENT_MODEL;
}

export function resolveFallbackModel(): string {
  return process.env.AGENT_FALLBACK_MODEL || DEFAULT_FALLBACK_AGENT_MODEL;
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
 * Groq returns three distinct error shapes when a request bumps into a quota,
 * and they need three different responses:
 *  - "rate_limited" (usually 429): cumulative usage over the current MINUTE
 *    window is exhausted. The error message includes a concrete wait
 *    ("Please try again in 10.65s") — waiting that long and resending the
 *    SAME request is a valid fix.
 *  - "too_large" (usually 413, "Request too large... reduce your message
 *    size"): THIS single request's token count exceeds the entire TPM
 *    budget outright, regardless of timing. Waiting and resending the
 *    identical payload will fail again every time — the only fix is
 *    shrinking the request itself before retrying.
 *  - "daily_exhausted" (429, "tokens per day (TPD): Limit 100000, Used
 *    99848"): the DAILY quota is gone. Structurally different from the other
 *    two because the stated wait is in the tens of minutes — a real one was
 *    "try again in 22m4.512s" — which is far beyond AGENT_CAPS.maxWallClockMs
 *    (5 minutes). Waiting is not an available strategy; the only useful moves
 *    are a model with its own separate daily budget, or telling the user
 *    plainly when the quota resets.
 * Distinguished by message content, not just status code, since Groq uses 429
 * for both the minute and the day window and has used 413 for more than one
 * case historically.
 */
export type RateLimitKind = "too_large" | "daily_exhausted" | "rate_limited";

export class AgentRateLimitError extends AgentModelError {
  readonly kind: RateLimitKind;
  readonly waitSeconds: number | null;

  constructor(kind: RateLimitKind, waitSeconds: number | null, message: string) {
    super(message);
    this.kind = kind;
    this.waitSeconds = waitSeconds;
  }
}

/**
 * The model's reply was cut off because it hit MAX_COMPLETION_TOKENS
 * (`finish_reason: "length"`), rather than finishing what it meant to say.
 * Almost always a write_file whose content is too large to emit in one call.
 *
 * Deliberately NOT retryable, and deliberately not a reason to switch models:
 * the ceiling is ours, it is the same on every model, and the model will
 * regenerate the same over-long content and hit the same wall every time.
 * Retrying it burns a full prompt+MAX_COMPLETION_TOKENS charge per attempt
 * against a budget that is already the thing under pressure — which is what
 * the generic tool-call-generation retry path used to do to it.
 */
export class AgentResponseTruncatedError extends AgentModelError {}

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

/**
 * Groq writes its wait times in a compound duration format, not plain
 * seconds: a minute-window limit says "try again in 13.68s" but a daily one
 * says "try again in 13m40.8s" (and "22m4.512s" has been seen live). The
 * previous pattern — /try again in ([\d.]+)s/ — matched only the
 * seconds-only form, so every minute-formatted wait silently fell through to
 * DEFAULT_RATE_LIMIT_WAIT_SECONDS and the agent retried three times at 15s
 * against a 13-minute cooldown.
 *
 * All three groups are optional so any subset ("40.8s", "13m", "1h2m3s")
 * parses; the caller-facing helper below rejects a match with no groups at
 * all, so a bare "try again in" reports null rather than a bogus 0.
 */
const WAIT_RE = /try again in\s+(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i;

export function parseWaitSeconds(message: string): number | null {
  const m = message.match(WAIT_RE);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return parseFloat(m[1] ?? "0") * 3600 + parseFloat(m[2] ?? "0") * 60 + parseFloat(m[3] ?? "0");
}

function classifyRateLimit(message: string): RateLimitKind {
  if (/request too large|reduce your message size/i.test(message)) return "too_large";
  if (/tokens per day|requests per day|\bTPD\b|\bRPD\b/i.test(message)) return "daily_exhausted";
  return "rate_limited";
}

function parseRateLimitInfo(bodyText: string, retryAfterHeader: string | null): { kind: RateLimitKind; waitSeconds: number | null; message: string } {
  let message = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) message = parsed.error.message;
  } catch {
    // Not JSON — use the raw body text as the message.
  }

  const parsedWait = parseWaitSeconds(message);
  const headerWait = retryAfterHeader ? Number(retryAfterHeader) : null;
  const waitSeconds = parsedWait ?? (headerWait !== null && Number.isFinite(headerWait) ? headerWait : null);

  return { kind: classifyRateLimit(message), waitSeconds, message };
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
  // Both the primary and fallback models run on Groq.
  const provider = "groq" as const;

  // Pace against the token budget before the network call.
  const estimate = estimateBilledTokens(messages, MAX_COMPLETION_TOKENS);
  await waitForTokenBudget(
    estimate,
    model,
    async (waitMs) => {
      // Intentionally not calling onStatus here so the UI doesn't show
      // the pacing message to the user.
    },
    undefined,
    stopSignal ? () => stopSignal.aborted : undefined
  );
  if (stopSignal?.aborted) throw new AgentModelError("Stopped by user request.");

  const reservation = reserveEstimate(estimate, model);
  let response: Response;
  try {
    const { PROVIDERS } = await import("@/lib/llm/providers");
    const config = PROVIDERS[provider];
    if (!config.apiKey) {
      throw new AgentModelError(`API key for provider "${provider}" is not configured.`);
    }

    response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...config.defaultHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: MAX_COMPLETION_TOKENS,
        // stream is intentionally NOT set (defaults to false). The agent
        // needs the complete tool_calls array, not an SSE token stream.
      }),
      signal: stopSignal
        ? AbortSignal.any([AbortSignal.timeout(60_000), stopSignal])
        : AbortSignal.timeout(60_000),
    });
  } catch (err) {
    releaseReservation(reservation);
    throw err;
  }

  // Every response carries the provider's own view of this model's limit.
  recordObservedLimits(model, response.headers);

  if (!response.ok) {
    releaseReservation(reservation);
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
  const choice = data.choices?.[0];
  const message = choice?.message;
  if (!message) {
    releaseReservation(reservation);
    throw new AgentModelError("Agent model returned no message.");
  }

  // What stays deducted from the rolling window once the call settles. Groq
  // checks admission against prompt + max_tokens (see reserveEstimate above)
  // but only *consumes* what the exchange actually used — measured directly:
  // a max_tokens=2500 call whose completion was 2 tokens moved the remaining
  // counter by 81, not by 2,542. Reserve the ceiling, settle on the actual.
  // (token-budget.ts's header accounts for that 81 and for why the header
  // counter can't be used as a per-call ledger.)
  const settledTokens =
    data.usage?.total_tokens ?? (data.usage?.prompt_tokens ?? estimatePromptTokens(messages));

  if (choice.finish_reason === "length") {
    reconcileReservation(reservation, settledTokens);
    throw new AgentResponseTruncatedError(
      `The model's reply was cut off at the ${MAX_COMPLETION_TOKENS}-token per-response limit before it finished. ` +
        `This usually means a single write_file tried to emit a file too large to fit in one call — split the change into smaller files or edits.`
    );
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

  // The reservation held prompt + MAX_COMPLETION_TOKENS for the whole time
  // the request was in flight, which is what keeps a second concurrent call
  // from being admitted into headroom this one might still need. Now that the
  // exchange has settled, shrink it to what was really consumed so the pacer
  // doesn't idle on budget nobody is using.
  reconcileReservation(reservation, settledTokens);

  const approxTokens: number =
    data.usage?.total_tokens ??
    Math.ceil((JSON.stringify(messages).length + JSON.stringify(message).length) / CHARS_PER_TOKEN);

  return { message, toolCalls, approxTokens };
}
