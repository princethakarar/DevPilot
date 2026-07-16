import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position, CancellationToken } from "monaco-editor";
import { SUPPORTED_LANGUAGE_IDS } from "./editor-config";

const DEBOUNCE_MS = 250;
const CACHE_TTL_MS = 15_000;
const CACHE_MAX_ENTRIES = 30;
// How much of the prefix/suffix to hash for the cache key — a full-content
// hash would defeat the point (cursor moving one character invalidates
// everything); a short local slice is enough to recognize "the user is right
// back where they just were" (rapid cursor back-and-forth) without needing
// exact-position tracking.
const CACHE_KEY_TAIL_LEN = 200;
const CACHE_KEY_HEAD_LEN = 200;

const PREFIX_CHAR_BUDGET = 6000;
const SUFFIX_CHAR_BUDGET = 2000;

interface CacheEntry {
  text: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.text;
}

function cacheSet(key: string, text: string) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { text, expiresAt: Date.now() + CACHE_TTL_MS });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCompletion(
  prefix: string,
  suffix: string,
  language: string,
  filename: string,
  signal: AbortSignal
): Promise<string> {
  try {
    const res = await fetch("/api/ai/inline-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, suffix, language, filename }),
      signal,
    });
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data.suggestion === "string" ? data.suggestion : "";
  } catch (error) {
    // Aborts are expected (superseded by a newer keystroke/cursor move) — not
    // an error. Anything else fails silently in the editor by design: a
    // ghost-text suggestion that occasionally doesn't show up is fine, an
    // error popup interrupting typing is not. Logged for debugging only.
    if ((error as Error)?.name !== "AbortError") {
      console.warn("[inline-completion] request failed:", error);
    }
    return "";
  }
}

/**
 * Registers the ghost-text inline completion provider across every language
 * this editor supports. Relies entirely on Monaco's OWN native inline-suggest
 * widget for rendering/Tab-accept/Esc-dismiss — this function only decides
 * WHAT text to suggest, never how it's displayed or which key accepts it.
 * That's deliberate: the previous implementation hand-rolled a competing Tab
 * command and manual decorations alongside a real registerInlineCompletionsProvider
 * call, which is exactly what caused Tab to behave inconsistently. Monaco's
 * built-in behavior (Tab accepts only when a suggestion is visible, otherwise
 * falls through to normal indentation; Esc dismisses) is already correct —
 * the fix is to not compete with it.
 *
 * Debouncing and cancellation: Monaco calls `provideInlineCompletions` again
 * (and cancels the previous call's token) on every relevant edit/cursor move.
 * Awaiting a short delay before doing any work, then checking the token, is
 * the standard way inline-completion providers debounce — a keystroke within
 * that window cancels this call before it ever reaches the network.
 */
export function registerInlineCompletionProvider(
  monaco: Monaco,
  isEnabled: () => boolean
): { dispose: () => void } {
  const disposables = SUPPORTED_LANGUAGE_IDS.map((language) =>
    monaco.languages.registerInlineCompletionsProvider(language, {
      provideInlineCompletions: async (
        model: editor.ITextModel,
        position: Position,
        context: languages.InlineCompletionContext,
        token: CancellationToken
      ) => {
        if (!isEnabled()) return { items: [] };

        const offset = model.getOffsetAt(position);
        const fullText = model.getValue();
        const rawPrefix = fullText.slice(0, offset);
        const rawSuffix = fullText.slice(offset);
        const prefix = rawPrefix.length > PREFIX_CHAR_BUDGET ? rawPrefix.slice(-PREFIX_CHAR_BUDGET) : rawPrefix;
        const suffix = rawSuffix.length > SUFFIX_CHAR_BUDGET ? rawSuffix.slice(0, SUFFIX_CHAR_BUDGET) : rawSuffix;

        const cacheKey = `${model.uri.toString()}::${prefix.slice(-CACHE_KEY_TAIL_LEN)}::${suffix.slice(0, CACHE_KEY_HEAD_LEN)}`;
        const cached = cacheGet(cacheKey);
        if (cached !== undefined) {
          return cached ? { items: [{ insertText: cached, range: emptyRangeAt(monaco, position) }] } : { items: [] };
        }

        // Skip the debounce delay for an explicitly triggered request (a
        // manual invocation, or our own idle re-check below) — only
        // automatic, as-you-type triggers should wait out the quiet period.
        // (Monaco's enum here is Automatic/Explicit — there is no "Invoke"
        // member; referencing one that doesn't exist would silently compare
        // against `undefined` and always take the debounce branch.)
        if (context.triggerKind !== monaco.languages.InlineCompletionTriggerKind.Explicit) {
          await sleep(DEBOUNCE_MS);
        }
        if (token.isCancellationRequested) return { items: [] };

        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());

        const filename = model.uri.path.split("/").pop() || "";
        const text = await fetchCompletion(prefix, suffix, model.getLanguageId(), filename, controller.signal);

        cacheSet(cacheKey, text);

        if (token.isCancellationRequested || !text) return { items: [] };
        return { items: [{ insertText: text, range: emptyRangeAt(monaco, position) }] };
      },
      freeInlineCompletions: () => {
        // No per-item disposables allocated above — nothing to free.
      },
    })
  );

  return {
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function emptyRangeAt(monaco: Monaco, position: Position) {
  return new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
}
