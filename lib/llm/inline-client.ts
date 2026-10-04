/**
 * Inline code suggestion client — dedicated FIM implementation using Mistral Codestral.
 */

const MAX_INLINE_TOKENS = 128;
const INLINE_TEMPERATURE = 0;
const INLINE_STOP = ["\n\n", "```"];

/**
 * Calls Mistral Codestral FIM endpoint to generate an inline code completion.
 *
 * @param prefix - Everything in the file BEFORE the cursor.
 * @param suffix - Everything in the file AFTER the cursor.
 * @returns The suggested completion text, or "" on any failure.
 */
export async function getInlineSuggestion(
  prefix: string,
  suffix: string
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.warn("[getInlineSuggestion] MISTRAL_API_KEY is not set.");
    return "";
  }

  try {
    const res = await fetch("https://codestral.mistral.ai/v1/fim/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "codestral-latest",
        prompt: prefix,
        suffix: suffix,
        max_tokens: MAX_INLINE_TOKENS,
        temperature: INLINE_TEMPERATURE,
        stop: INLINE_STOP,
      }),
    });

    if (!res.ok) {
      console.warn(`[getInlineSuggestion] Mistral API error: ${res.status} ${res.statusText}`);
      return "";
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      console.warn("[getInlineSuggestion] Unexpected error:", err);
    }
    return "";
  }
}

