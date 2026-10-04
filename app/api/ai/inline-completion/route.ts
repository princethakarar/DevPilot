import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/actions";
import { checkInlineCompletionRateLimit } from "@/lib/ai/rate-limiter";
import { redactSecrets } from "@/lib/ai/redact-secrets";
import { getInlineSuggestion } from "@/lib/llm/inline-client";

export const maxDuration = 15;


interface InlineCompletionRequest {
  prefix: string;
  suffix: string;
  language?: string;
  filename?: string;
}

// Rough token budget for prefix+suffix combined. No tokenizer dependency —
// ~4 chars/token is a standard, good-enough approximation for code across
// languages; being off by some percent just shifts the effective budget
// slightly, it doesn't break anything. Prefix gets the larger share since
// "what led up to the cursor" is usually more predictive than what follows.
const PREFIX_CHAR_BUDGET = 6000; // ~1500 tokens
const SUFFIX_CHAR_BUDGET = 2000; // ~500 tokens

function trimToBudget(prefix: string, suffix: string) {
  return {
    prefix: prefix.length > PREFIX_CHAR_BUDGET ? prefix.slice(-PREFIX_CHAR_BUDGET) : prefix,
    suffix: suffix.length > SUFFIX_CHAR_BUDGET ? suffix.slice(0, SUFFIX_CHAR_BUDGET) : suffix,
  };
}

/** Defensive cleanup in case the model emits markdown fences or commentary
 *  despite the FIM endpoint being completion-only, not chat — belt and
 *  suspenders, not the primary control (the primary control is using the
 *  actual FIM endpoint instead of a chat prompt in the first place). */
function cleanCompletion(text: string): string {
  let cleaned = text.replace(/^```[\w-]*\n?/, "").replace(/\n?```\s*$/, "");
  // Defensively cut anything that looks like the model slipped into
  // explaining itself on a new paragraph rather than just completing code.
  const explanationMarker = cleaned.search(/\n\s*(Here|This|Note:|Explanation:)\b/);
  if (explanationMarker !== -1) cleaned = cleaned.slice(0, explanationMarker);
  return cleaned;
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!checkInlineCompletionRateLimit(user.id)) {
    // Not an error the editor should surface — the frontend treats any
    // non-200 as "no suggestion this time" and stays silent.
    return NextResponse.json({ suggestion: "", rateLimited: true }, { status: 429 });
  }

  let body: InlineCompletionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prefix, suffix } = body;
  if (typeof prefix !== "string" || typeof suffix !== "string") {
    return NextResponse.json({ error: "prefix and suffix are required strings" }, { status: 400 });
  }
  // `language`/`filename` are accepted per the request shape (useful context for
  // logging, future providers, or a model that does accept them) but Mistral's
  // FIM endpoint itself takes only prompt/suffix/model — it infers language from
  // the code itself, so they aren't forwarded to the request body below.

  const trimmed = trimToBudget(prefix, suffix);
  const safePrefix = redactSecrets(trimmed.prefix);
  const safeSuffix = redactSecrets(trimmed.suffix);

  const raw = await getInlineSuggestion(safePrefix, safeSuffix);
  const suggestion = cleanCompletion(raw);

  // DEBUG — remove once inline suggestions are confirmed working
  console.log("[inline-completion] raw:", JSON.stringify(raw));
  console.log("[inline-completion] suggestion:", JSON.stringify(suggestion));
  
  const fs = require('fs');
  fs.writeFileSync('e:/Web Devlopment/DevPilot/debug-inline.json', JSON.stringify({ raw, suggestion }));

  return NextResponse.json({ suggestion });
}
