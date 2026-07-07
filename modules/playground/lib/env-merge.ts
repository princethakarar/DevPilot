import type { TemplateFolder, TemplateItem } from "./path-to-json";

export interface EnvVarPair {
  key: string;
  value: string;
}

function isDotEnvFile(item: TemplateItem): item is { filename: string; fileExtension: string; content: string } {
  if ("folderName" in item) return false;
  const name = item.fileExtension ? `${item.filename}.${item.fileExtension}` : item.filename;
  return name === ".env";
}

/**
 * Finds the first file anywhere in the tree that renders to exactly ".env"
 * (only that exact name — not .env.local/.env.example/etc). Returns its
 * content and the folder path (from tree root, exclusive) it lives at, so a
 * later re-inject can put it back in the same place.
 */
export function findEnvFile(
  tree: TemplateFolder
): { content: string; path: string[] } | null {
  function walk(folder: TemplateFolder, path: string[]): { content: string; path: string[] } | null {
    for (const item of folder.items) {
      if ("folderName" in item) {
        const found = walk(item, [...path, item.folderName]);
        if (found) return found;
      } else if (isDotEnvFile(item)) {
        return { content: item.content, path };
      }
    }
    return null;
  }
  return walk(tree, []);
}

/** Returns a new tree with any ".env" file removed. Does not mutate the input. */
export function stripEnvFile(tree: TemplateFolder): TemplateFolder {
  function walk(folder: TemplateFolder): TemplateFolder {
    const items: TemplateItem[] = [];
    for (const item of folder.items) {
      if ("folderName" in item) {
        items.push(walk(item));
      } else if (!isDotEnvFile(item)) {
        items.push(item);
      }
    }
    return { ...folder, items };
  }
  return walk(tree);
}

/**
 * Returns a new tree with a ".env" file containing `content` inserted at
 * `path` (replacing one if already present there). If `path` no longer
 * resolves (the folder was renamed/deleted since the vars were last saved),
 * falls back to inserting at the tree's own root.
 */
export function injectEnvFile(
  tree: TemplateFolder,
  path: string[],
  content: string
): TemplateFolder {
  function insertAt(folder: TemplateFolder): TemplateFolder {
    const withoutEnv = folder.items.filter((item) => "folderName" in item || !isDotEnvFile(item));
    return { ...folder, items: [...withoutEnv, { filename: ".env", fileExtension: "", content }] };
  }

  function walk(folder: TemplateFolder, remaining: string[]): TemplateFolder | null {
    if (remaining.length === 0) return insertAt(folder);
    const [head, ...rest] = remaining;
    let changed: TemplateFolder | null = null;
    const items = folder.items.map((item) => {
      if (!changed && "folderName" in item && item.folderName === head) {
        const result = walk(item, rest);
        if (result) {
          changed = result;
          return result;
        }
      }
      return item;
    });
    return changed ? { ...folder, items } : null;
  }

  return walk(tree, path) ?? insertAt(tree);
}

/** Parses ".env" file text into key/value pairs. Ignores blank lines, comments, and unparsable lines. */
export function parseEnvContent(content: string): EnvVarPair[] {
  const vars: EnvVarPair[] = [];
  for (const rawLine of content.split(/\r\n|\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const rawValue = match[2].trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    vars.push({ key: match[1], value: unquoted });
  }
  return vars;
}

/** Serializes key/value pairs back into ".env" file text. */
export function serializeEnvContent(vars: EnvVarPair[]): string {
  if (vars.length === 0) return "";
  return vars.map((v) => `${v.key}=${v.value}`).join("\n") + "\n";
}
