import { type NextRequest, NextResponse } from "next/server";

interface CodeSuggestionRequest {
  fileContent: string;
  cursorLine: number;
  cursorColumn: number;
  suggestionType: string;
  fileName?: string;
}

interface CodeContext {
  language: string;
  framework: string;
  prefix: string;
  suffix: string;
  cursorPosition: { line: number; column: number };
  imports: string[];
  currentFunction: string;
  isInFunction: boolean;
  isInClass: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: CodeSuggestionRequest = await request.json();
    const { fileContent, cursorLine, cursorColumn, suggestionType, fileName } = body;

    if (!fileContent || cursorLine < 0 || cursorColumn < 0 || !suggestionType) {
      return NextResponse.json(
        { error: "Invalid input parameters" },
        { status: 400 }
      );
    }

    if (fileContent.length > 100000) {
      return NextResponse.json(
        { error: "File too large for code completion" },
        { status: 413 }
      );
    }

    const context = analyzeCodeContext(
      fileContent,
      cursorLine,
      cursorColumn,
      fileName
    );

    const suggestion = await generateSuggestion(context);

    return NextResponse.json({
      suggestion: suggestion.trim(),
      metadata: {
        language: context.language,
        framework: context.framework,
      },
    });
  } catch (error: any) {
    console.error("Code completion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function analyzeCodeContext(
  content: string,
  line: number,
  column: number,
  fileName?: string
): CodeContext {
  const lines = content.split("\n");
  const currentLine = lines[line] || "";

  // Extract prefix: current file content up to cursor
  const prefixLines = lines.slice(0, line);
  prefixLines.push(currentLine.substring(0, column));
  const prefix = prefixLines.join("\n");

  // Extract suffix: content after cursor (next 30 lines for context)
  const suffixLines = lines.slice(line, Math.min(line + 30, lines.length));
  if (suffixLines.length > 0) {
    suffixLines[0] = suffixLines[0].substring(column);
  }
  const suffix = suffixLines.join("\n");

  // Detect language and framework
  const language = detectLanguage(content, fileName);
  const framework = detectFramework(content);

  // Extract imports
  const imports = extractImports(content);

  // Detect context
  const isInFunction = detectInFunction(lines, line);
  const isInClass = detectInClass(lines, line);
  const currentFunction = extractFunctionSignature(lines, line);

  return {
    language,
    framework,
    prefix,
    suffix,
    cursorPosition: { line, column },
    imports,
    currentFunction,
    isInFunction,
    isInClass,
  };
}

async function generateSuggestion(context: CodeContext): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "";

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  // Build FIM-style prompt (similar to what Copilot uses)
  const prompt = buildFIMPrompt(context);

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are an expert code completion engine. You complete code based on context.
Generate ONLY the code to insert. No explanations, no markdown, no extra text.
Match the existing code style, indentation, and patterns exactly.
Do NOT repeat code that already exists.
Do NOT include code from the suffix.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.15,
          max_tokens: 150,
          top_p: 0.9,
          stop: ["\n\n", "```", "//"],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Groq API error:", error);
      return "";
    }

    const data = await response.json();
    let suggestion = data.choices?.[0]?.message?.content || "";

    // Clean up suggestion
    suggestion = cleanSuggestion(suggestion, context);

    // Filter out suggestions that duplicate existing code
    suggestion = filterDuplicates(suggestion, context);

    return suggestion.trim();
  } catch (error) {
    console.error("Generation error:", error);
    return "";
  }
}

function buildFIMPrompt(context: CodeContext): string {
  const { prefix, suffix, language, framework, imports, currentFunction, isInFunction } = context;

  // Add context hints based on what we detected
  const contextHints = [
    language && `Language: ${language}`,
    framework && `Framework: ${framework}`,
    imports.length > 0 && `Imports: ${imports.slice(0, 5).join(", ")}`,
    isInFunction && `In Function: ${currentFunction || "anonymous"}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${contextHints}

<PREFIX>
${prefix}
</PREFIX>

<SUFFIX>
${suffix}
</SUFFIX>

Complete the code between <PREFIX> and <SUFFIX>. Output ONLY the inserted code.`;
}

function cleanSuggestion(suggestion: string, context: CodeContext): string {
  // Remove markdown code blocks
  suggestion = suggestion
    .replace(/^```[\w]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  // Remove explanatory text
  suggestion = suggestion
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Filter out common explanation patterns
      if (
        trimmed.startsWith("Here") ||
        trimmed.startsWith("This") ||
        trimmed.startsWith("Note") ||
        trimmed.startsWith("The ") ||
        trimmed.startsWith("Output") ||
        trimmed.startsWith("//")
      ) {
        return false;
      }
      return true;
    })
    .join("\n")
    .trim();

  // Ensure proper indentation based on cursor position
  const prefixLines = context.prefix.split("\n");
  const lastLine = prefixLines[prefixLines.length - 1];
  const baseIndent = lastLine.match(/^\s*/)?.[0] || "";

  return suggestion;
}

function filterDuplicates(suggestion: string, context: CodeContext): string {
  if (!suggestion) return "";

  const suffixStart = context.suffix.trim().substring(0, 100);

  // If suggestion appears in the next 100 chars of suffix, it's already there
  if (suffixStart.includes(suggestion)) {
    return "";
  }

  // Check if suggestion exactly matches upcoming lines in suffix
  const suffixLines = context.suffix.split("\n");
  const sugestionLines = suggestion.split("\n");

  if (
    suffixLines.length > 0 &&
    sugestionLines.length > 0 &&
    suffixLines[0].trim() === sugestionLines[0].trim()
  ) {
    return "";
  }

  return suggestion;
}

function detectLanguage(content: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      py: "Python",
      java: "Java",
      go: "Go",
      rs: "Rust",
      php: "PHP",
      rb: "Ruby",
      sql: "SQL",
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  if (content.includes("interface ") || content.includes(": string"))
    return "TypeScript";
  if (content.includes("def ") || content.includes("import ")) return "Python";
  if (content.includes("func ") || content.includes("package ")) return "Go";

  return "JavaScript";
}

function detectFramework(content: string): string {
  if (
    content.includes("import React") ||
    content.includes("useState") ||
    content.includes("useEffect")
  )
    return "React";
  if (content.includes("import Vue") || content.includes("<template>"))
    return "Vue";
  if (content.includes("@angular/") || content.includes("@Component"))
    return "Angular";
  if (
    content.includes("next/") ||
    content.includes("getServerSideProps") ||
    content.includes("getStaticProps")
  )
    return "Next.js";
  if (content.includes("import Svelte") || content.includes("<script>"))
    return "Svelte";

  return "";
}

function extractImports(content: string): string[] {
  const importRegex =
    /^(?:import|from|require)\s+[^\n;]+[;\n]/gm;
  const matches = content.match(importRegex) || [];
  return matches
    .map((imp) => imp.trim())
    .slice(0, 10) // Top 10 imports
    .filter(
      (imp) =>
        !imp.includes("from './") && !imp.includes('from "./')
    ); // Exclude local imports
}

function detectInFunction(lines: string[], currentLine: number): boolean {
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line?.match(/^\s*(function|const\s+\w+\s*=|let\s+\w+\s*=|async\s+function|def\s+)/)) {
      return true;
    }
    if (line?.trim() === "}" && i < currentLine - 1) {
      return false;
    }
  }
  return false;
}

function detectInClass(lines: string[], currentLine: number): boolean {
  let braceCount = 0;
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line?.includes("}")) braceCount++;
    if (line?.includes("{")) braceCount--;
    if (line?.match(/^\s*(class|interface)\s+/)) {
      return braceCount <= 0;
    }
  }
  return false;
}

function extractFunctionSignature(lines: string[], currentLine: number): string {
  for (let i = currentLine; i >= 0; i--) {
    const line = lines[i];
    if (
      line?.match(/^\s*(function|const|let|async|def|func)\s+/)
    ) {
      return line.trim().substring(0, 60);
    }
  }
  return "";
}
