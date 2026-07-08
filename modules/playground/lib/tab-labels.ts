import { getFileDisplayName } from "./index";

export interface TabFileRef {
  /** Full path from the project root, "/"-separated (e.g. "Backend/.env"), as produced by generateFileId. */
  id: string;
  filename: string;
  fileExtension: string;
}

/**
 * Derives a display label per open tab, prefixing just enough parent-folder
 * segments to disambiguate tabs whose bare filename collides with another
 * currently-open tab (e.g. "Backend/.env" vs "Frontend/.env"). Filenames that
 * are unique among open tabs keep their bare name. Purely derived from the
 * current `files` list (no stored state), so it stays correct as tabs
 * open/close. Comparison is case-insensitive to match findSiblingNameConflict's
 * treatment of the underlying (possibly case-insensitive) filesystem.
 */
export function computeTabLabels(files: TabFileRef[]): Map<string, string> {
  const labels = new Map<string, string>();
  const bareNameOf = (f: TabFileRef) => getFileDisplayName(f.filename, f.fileExtension);

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

  // Parent folder segments only (excludes the filename itself), nearest-first.
  const parentSegmentsOf = (f: TabFileRef) => f.id.split("/").filter(Boolean).slice(0, -1).reverse();

  for (const group of groups.values()) {
    if (group.length === 1) {
      labels.set(group[0].id, bareNameOf(group[0]));
      continue;
    }

    const maxDepth = Math.max(...group.map((f) => parentSegmentsOf(f).length));

    for (let depth = 1; depth <= maxDepth; depth++) {
      const candidate = new Map<string, string>();
      const seen = new Set<string>();
      let allUnique = true;

      for (const file of group) {
        const nearestSegments = parentSegmentsOf(file).slice(0, depth).reverse();
        const bare = bareNameOf(file);
        const label = nearestSegments.length > 0 ? `${nearestSegments.join("/")}/${bare}` : bare;
        if (seen.has(label)) allUnique = false;
        seen.add(label);
        candidate.set(file.id, label);
      }

      if (allUnique || depth === maxDepth) {
        for (const [id, label] of candidate) labels.set(id, label);
        break;
      }
    }
  }

  return labels;
}
