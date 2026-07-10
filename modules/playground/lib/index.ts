import { TemplateFile, TemplateFolder, TemplateItem } from "./path-to-json";

/**
 * Renders a file's display/on-disk name. Extensionless files (Dockerfile, LICENSE)
 * and dotfiles with no further extension (.env, .gitignore) must not get a trailing dot.
 */
export function getFileDisplayName(filename: string, fileExtension: string): string {
  return fileExtension ? `${filename}.${fileExtension}` : filename;
}

/**
 * Splits a raw, user-typed file name into { filename, fileExtension }, mirroring
 * Node's path.parse semantics: a leading dot alone (".env") is not an extension
 * separator, but a second dot (".env.local") is.
 */
export function splitFilename(raw: string): { filename: string; fileExtension: string } {
  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0) {
    return { filename: raw, fileExtension: "" };
  }
  return { filename: raw.slice(0, lastDot), fileExtension: raw.slice(lastDot + 1) };
}

/**
 * Canonical, unique identity for an open file: its full path from the project
 * root, "/"-joined. This — not filename+extension alone — is the only thing
 * that safely distinguishes files that share a name in different folders
 * (e.g. "Backend/.env" vs "Frontend/.env"). It's used as the openFiles/Monaco
 * model/WebContainer-fs key everywhere; always construct it from a directly
 * known parentPath (as every call site here has one in scope), never by
 * searching the tree for a name match (see findFilePath's warning below).
 */
export function buildFileId(parentPath: string, filename: string, fileExtension: string): string {
  const cleanParentPath = parentPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const name = getFileDisplayName(filename, fileExtension);
  return cleanParentPath ? `${cleanParentPath}/${name}` : name;
}

/**
 * WARNING — unsafe as a file-identity lookup: this matches purely by
 * filename+fileExtension, with no awareness of which folder the `file`
 * argument actually came from. If two files share a name in different
 * folders (e.g. "Backend/.env" and "Frontend/.env"), this returns the SAME
 * path (whichever one is encountered first in tree order) for both —
 * silently aliasing distinct files to one identity. That was a real, shipped
 * bug (see generateFileId below, previously used for openFile/rename/delete
 * lookups). Do not use this to compute a file's id/path; if you already know
 * the parent directory (every caller in useFileExplorer.tsx does), build the
 * id directly with buildFileId instead.
 */
export function findFilePath(
  file: TemplateFile,
  folder: TemplateFolder,
  pathSoFar: string[] = []
): string | null {
  for (const item of folder.items) {
    if ("folderName" in item) {
      const res = findFilePath(file, item, [...pathSoFar, item.folderName]);
      if (res) return res;
    } else {
      if (
        item.filename === file.filename &&
        item.fileExtension === file.fileExtension
      ) {
        return [
          ...pathSoFar,
          item.filename + (item.fileExtension ? "." + item.fileExtension : ""),
        ].join("/");
      }
    }
  }
  return null;
}



/**
 * Immutably updates a single file's content at an exact path (e.g. "src/.env" or
 * ".env"), without touching any other node — including files that happen to share
 * the same name in a different folder. Uses structural sharing (only the path's
 * own ancestor chain is rebuilt), so it's cheap even on large trees, unlike a full
 * JSON.parse(JSON.stringify(...)) deep clone.
 */
export function updateFileContentAtPath(
  root: TemplateFolder,
  filePath: string,
  content: string
): TemplateFolder {
  const segments = filePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0) return root;

  const targetName = segments[segments.length - 1];
  const folderSegments = segments.slice(0, -1);

  function recurse(folder: TemplateFolder, depth: number): TemplateFolder {
    if (depth === folderSegments.length) {
      return {
        ...folder,
        items: folder.items.map((item) => {
          if ("filename" in item) {
            return getFileDisplayName(item.filename, item.fileExtension) === targetName
              ? { ...item, content }
              : item;
          }
          return item;
        }),
      };
    }

    const nextName = folderSegments[depth];
    return {
      ...folder,
      items: folder.items.map((item) =>
        "folderName" in item && item.folderName === nextName ? recurse(item, depth + 1) : item
      ),
    };
  }

  return recurse(root, 0);
}

/**
 * Immutably creates-or-updates a single file's content at an exact path,
 * auto-creating any missing intermediate folders along the way. Used to restore
 * a file that was deleted locally (discard changes) back into the tree.
 */
export function setFileContentAtPath(
  root: TemplateFolder,
  filePath: string,
  content: string
): TemplateFolder {
  const segments = filePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0) return root;

  const targetName = segments[segments.length - 1];
  const folderSegments = segments.slice(0, -1);
  const { filename, fileExtension } = splitFilename(targetName);

  function recurse(folder: TemplateFolder, depth: number): TemplateFolder {
    if (depth === folderSegments.length) {
      const idx = folder.items.findIndex(
        (item) =>
          "filename" in item && getFileDisplayName(item.filename, item.fileExtension) === targetName
      );
      if (idx >= 0) {
        const items = [...folder.items];
        items[idx] = { ...(items[idx] as TemplateFile), content };
        return { ...folder, items };
      }
      return { ...folder, items: [...folder.items, { filename, fileExtension, content }] };
    }

    const nextName = folderSegments[depth];
    const idx = folder.items.findIndex((item) => "folderName" in item && item.folderName === nextName);
    if (idx >= 0) {
      const items = [...folder.items];
      items[idx] = recurse(items[idx] as TemplateFolder, depth + 1);
      return { ...folder, items };
    }
    // Auto-create the missing intermediate folder.
    const newFolder = recurse({ folderName: nextName, items: [] }, depth + 1);
    return { ...folder, items: [...folder.items, newFolder] };
  }

  return recurse(root, 0);
}

/**
 * Immutably removes a single file at an exact path, without touching any other
 * node. Used to discard a locally-added file that has no counterpart to
 * restore to (i.e. it doesn't exist in the last-synced GitHub base).
 */
export function removeItemAtPath(root: TemplateFolder, filePath: string): TemplateFolder {
  const segments = filePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0) return root;

  const targetName = segments[segments.length - 1];
  const folderSegments = segments.slice(0, -1);

  function recurse(folder: TemplateFolder, depth: number): TemplateFolder {
    if (depth === folderSegments.length) {
      return {
        ...folder,
        items: folder.items.filter((item) => {
          if (!("filename" in item)) return true;
          return getFileDisplayName(item.filename, item.fileExtension) !== targetName;
        }),
      };
    }

    const nextName = folderSegments[depth];
    return {
      ...folder,
      items: folder.items.map((item) =>
        "folderName" in item && item.folderName === nextName ? recurse(item, depth + 1) : item
      ),
    };
  }

  return recurse(root, 0);
}

/**
 * True if `items` (the entries of a single directory) already contains
 * something named `candidateName`. Comparison is case-insensitive because the
 * underlying filesystem may be case-insensitive (Windows/macOS default), so
 * "Foo.txt" and "foo.txt" collide even though the in-memory tree is itself
 * case-sensitive. A file and a folder sharing a name also collide, matching
 * real filesystem semantics. Pass `skip` (the item being renamed) to exclude
 * it from the check, so a no-op or case-only rename of the same item isn't
 * blocked as a false-positive collision with itself.
 */
export function findSiblingNameConflict(
  items: TemplateItem[],
  candidateName: string,
  skip?: TemplateItem
): boolean {
  const target = candidateName.toLowerCase();
  return items.some((item) => {
    if (item === skip) return false;
    const name =
      "folderName" in item
        ? item.folderName
        : getFileDisplayName(item.filename, item.fileExtension);
    return name.toLowerCase() === target;
  });
}

/**
 * WARNING — unsafe as a file-identity lookup: inherits findFilePath's
 * name-only matching, so it aliases two files sharing a name in different
 * folders (e.g. "Backend/.env" and "Frontend/.env") to the same id. Kept only
 * because an existing scratch script (scratch/test-id.ts) references it — no
 * production code calls it anymore. Use buildFileId instead.
 */
export const generateFileId = (file: TemplateFile, rootFolder: TemplateFolder): string => {
  // Find the file's path in the folder structure
  const path = findFilePath(file, rootFolder)?.replace(/^\/+/, '');
  if (path) return path;

  // Handle empty/undefined file extension as fallback
  const extension = file.fileExtension?.trim();
  const extensionSuffix = extension ? `.${extension}` : '';

  return `${file.filename}${extensionSuffix}`;
}