/**
 * Build a TemplateFolder tree from a flat path->content map. Shared by the
 * GitHub repo-import action and the agent checkpoint-revert action (same
 * "fetch a GitHub tree, rebuild a TemplateFolder" shape as a repo import,
 * just against one historical commit instead of a branch head).
 *
 * Deliberately NOT in actions/github.ts itself: that file is "use server",
 * and Next.js requires every export of a "use server" file to be an async
 * Server Action — a plain synchronous helper can't live there.
 */
export function buildTemplateFolderFromPaths(
  fileContents: Map<string, string>,
  rootName: string
) {
  interface TempFolder {
    folderName: string;
    items: (TempFolder | { filename: string; fileExtension: string; content: string })[];
  }

  const root: TempFolder = { folderName: rootName, items: [] };

  for (const [filePath, content] of fileContents) {
    const parts = filePath.split("/");
    let current = root;

    // Navigate/create folders for all but the last segment
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let existing = current.items.find(
        (item): item is TempFolder =>
          "folderName" in item && item.folderName === folderName
      );

      if (!existing) {
        existing = { folderName, items: [] };
        current.items.push(existing);
      }
      current = existing;
    }

    // Add the file
    const fileName = parts[parts.length - 1];
    const lastDot = fileName.lastIndexOf(".");
    const name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    const ext = lastDot > 0 ? fileName.substring(lastDot + 1) : "";

    current.items.push({
      filename: name,
      fileExtension: ext,
      content,
    });
  }

  return root;
}
