/**
 * Strips lines that look like secrets from code sent to a third-party LLM.
 * Applied to prefix/suffix server-side, before either ever leaves this
 * process — never rely on the client to have done this.
 *
 * Deliberately line-based and conservative (over-redacting a false positive
 * line is harmless — the model just sees a placeholder instead of that one
 * line — under-redacting a real secret is not). Mirrors the spirit of
 * commit.ts's ALWAYS_IGNORED_PATTERNS (never let secret-shaped content leave
 * DevPilot's servers), applied to in-file text rather than whole files, since
 * the cursor can be inside a .env-like file or next to an inline hardcoded key.
 */
const SECRET_LINE_PATTERNS: RegExp[] = [
  // .env-style KEY=VALUE / KEY: VALUE assignments where the key name itself
  // suggests a credential, regardless of language (works for .env, YAML, JSON-ish).
  /^\s*[\w.]*(SECRET|TOKEN|API[_-]?KEY|PASSWORD|PASSWD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|AUTH|CREDENTIAL)[\w.]*\s*[:=]\s*.+$/i,
  // Common provider key formats, wherever they appear on a line.
  /sk-[A-Za-z0-9]{16,}/, // OpenAI-style
  /gsk_[A-Za-z0-9]{16,}/i, // Groq
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /ghp_[A-Za-z0-9]{20,}/, // GitHub PAT
  /Bearer\s+[A-Za-z0-9\-_.]{20,}/i,
  // PEM-style private key blocks.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const REDACTED_LINE = "// [redacted: line resembled a secret and was not sent for completion]";

export function redactSecrets(text: string): string {
  return text
    .split("\n")
    .map((line) => (SECRET_LINE_PATTERNS.some((pattern) => pattern.test(line)) ? REDACTED_LINE : line))
    .join("\n");
}
