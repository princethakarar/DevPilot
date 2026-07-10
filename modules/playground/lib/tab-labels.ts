import { getFileDisplayName } from "./index";

export interface TabFileRef {
  /** Full path from the project root, "/"-separated (e.g. "Backend/.env"), as produced by buildFileId. */
  id: string;
  filename: string;
  fileExtension: string;
}

export interface TabLabel {
  /** Folder context shown before the filename, styled as secondary/muted. Empty for root-level files — there's no folder to show. */
  folderHint: string;
  /** The bare filename, styled as primary. */
  fileName: string;
  /** The complete, untruncated path from the project root — always shows this in full (e.g. in a tooltip), regardless of how folderHint itself is truncated for display. */
  fullPath: string;
}

/**
 * Derives a per-tab label that always includes the immediate parent folder
 * for non-root files (e.g. "Backend/.env"), not only when a name collides
 * with another open tab — path context is useful regardless of duplicates.
 * Root-level files get no folder hint, since there's nothing to show. If the
 * immediate parent still isn't enough to disambiguate two open tabs sharing
 * both a filename AND their nearest folder (e.g. "apps/api/Backend/.env" vs
 * "apps/web/Backend/.env"), more parent segments are added until unique.
 * Purely derived from the current `files` list (no stored state), so it
 * stays correct as tabs open/close. Bare-name grouping is case-insensitive to
 * match findSiblingNameConflict's treatment of the underlying (possibly
 * case-insensitive) filesystem.
 */
export function computeTabLabels(files: TabFileRef[]): Map<string, TabLabel> {
  const bareNameOf = (f: TabFileRef) => getFileDisplayName(f.filename, f.fileExtension);
  // Parent folder segments only (excludes the filename itself), nearest-first.
  const parentSegmentsOf = (f: TabFileRef) => f.id.split("/").filter(Boolean).slice(0, -1).reverse();

  const groups = new Map<string, TabFileRef[]>();
  for (const file of files) {
    const key = bareNameOf(file).toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(file);
    } else {
      groups.set(key, [file]);
    }
  }

  const labels = new Map<string, TabLabel>();

  for (const group of groups.values()) {
    const maxDepth = Math.max(0, ...group.map((f) => parentSegmentsOf(f).length));

    const hintsAtDepth = (depth: number) => {
      const hints = new Map<string, string>();
      for (const file of group) {
        const nearest = parentSegmentsOf(file).slice(0, depth).reverse();
        hints.set(file.id, nearest.join("/"));
      }
      return hints;
    };

    // Always show at least the immediate parent (depth 1) when the file has
    // one; a purely root-level file naturally gets an empty hint since it has
    // no parent segments at any depth.
    let depth = Math.min(1, maxDepth);
    let hints = hintsAtDepth(depth);

    while (depth < maxDepth) {
      const seen = new Map<string, number>();
      for (const hint of hints.values()) seen.set(hint, (seen.get(hint) ?? 0) + 1);
      const collides = [...seen.values()].some((count) => count > 1);
      if (!collides) break;
      depth++;
      hints = hintsAtDepth(depth);
    }

    for (const file of group) {
      labels.set(file.id, {
        folderHint: hints.get(file.id) ?? "",
        fileName: bareNameOf(file),
        fullPath: file.id,
      });
    }
  }

  return labels;
}
