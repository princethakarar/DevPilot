import { describe, it, expect, beforeEach } from "vitest";
import { useFileExplorer } from "../useFileExplorer";
import type { TemplateFolder } from "../../lib/path-to-json";

/**
 * Regression test for the file-identity bug: opening Backend/.env and
 * Frontend/.env used to alias to the same id ("Backend/.env" for both),
 * because the old id computation (generateFileId/findFilePath) matched by
 * filename+extension alone, ignoring which folder the file actually came
 * from. Editing one silently edited the other. openFile now takes the
 * caller-known parentPath directly instead of re-deriving it via a tree
 * search, so these must always resolve to distinct ids/content.
 */

const noopSave = async (_data: TemplateFolder) => {};

function buildTree(): TemplateFolder {
  return {
    folderName: "root",
    items: [
      {
        folderName: "Backend",
        items: [{ filename: ".env", fileExtension: "", content: "BACKEND_SECRET=1" }],
      },
      {
        folderName: "Frontend",
        items: [{ filename: ".env", fileExtension: "", content: "FRONTEND_PUBLIC=1" }],
      },
    ],
  };
}

describe("useFileExplorer — cross-folder same-name file identity", () => {
  beforeEach(() => {
    useFileExplorer.setState({
      templateData: buildTree(),
      openFiles: [],
      activeFileId: null,
      editorContent: "",
    });
  });

  it("gives Backend/.env and Frontend/.env distinct ids and preserves independent content when both are opened", () => {
    const tree = useFileExplorer.getState().templateData!;
    const backendEnv = (tree.items[0] as TemplateFolder).items[0] as any;
    const frontendEnv = (tree.items[1] as TemplateFolder).items[0] as any;

    useFileExplorer.getState().openFile(backendEnv, "Backend", false);
    useFileExplorer.getState().openFile(frontendEnv, "Frontend", false);

    const { openFiles } = useFileExplorer.getState();
    expect(openFiles).toHaveLength(2);

    const backendTab = openFiles.find((f) => f.id === "Backend/.env");
    const frontendTab = openFiles.find((f) => f.id === "Frontend/.env");

    expect(backendTab).toBeDefined();
    expect(frontendTab).toBeDefined();
    expect(backendTab!.id).not.toBe(frontendTab!.id);
    expect(backendTab!.content).toBe("BACKEND_SECRET=1");
    expect(frontendTab!.content).toBe("FRONTEND_PUBLIC=1");
  });

  it("editing one tab's content never bleeds into the other tab with the same bare filename", () => {
    const tree = useFileExplorer.getState().templateData!;
    const backendEnv = (tree.items[0] as TemplateFolder).items[0] as any;
    const frontendEnv = (tree.items[1] as TemplateFolder).items[0] as any;

    useFileExplorer.getState().openFile(backendEnv, "Backend", false);
    useFileExplorer.getState().openFile(frontendEnv, "Frontend", false);

    useFileExplorer.getState().updateFileContent("Backend/.env", "BACKEND_SECRET=EDITED");

    const { openFiles } = useFileExplorer.getState();
    const backendTab = openFiles.find((f) => f.id === "Backend/.env")!;
    const frontendTab = openFiles.find((f) => f.id === "Frontend/.env")!;

    expect(backendTab.content).toBe("BACKEND_SECRET=EDITED");
    expect(backendTab.hasUnsavedChanges).toBe(true);
    expect(frontendTab.content).toBe("FRONTEND_PUBLIC=1");
    expect(frontendTab.hasUnsavedChanges).toBe(false);
  });

  it("re-opening the same file (same folder) activates the existing tab instead of duplicating it", () => {
    const tree = useFileExplorer.getState().templateData!;
    const backendEnv = (tree.items[0] as TemplateFolder).items[0] as any;

    useFileExplorer.getState().openFile(backendEnv, "Backend", false);
    useFileExplorer.getState().openFile(backendEnv, "Backend", false);

    expect(useFileExplorer.getState().openFiles).toHaveLength(1);
  });

  it("deleting Frontend/.env closes only the Frontend tab, leaving Backend/.env open and untouched", async () => {
    const tree = useFileExplorer.getState().templateData!;
    const backendEnv = (tree.items[0] as TemplateFolder).items[0] as any;
    const frontendEnv = (tree.items[1] as TemplateFolder).items[0] as any;

    useFileExplorer.getState().openFile(backendEnv, "Backend", false);
    useFileExplorer.getState().openFile(frontendEnv, "Frontend", false);

    await useFileExplorer.getState().handleDeleteFile(frontendEnv, "Frontend", noopSave);

    const { openFiles } = useFileExplorer.getState();
    expect(openFiles).toHaveLength(1);
    expect(openFiles[0].id).toBe("Backend/.env");
    expect(openFiles[0].content).toBe("BACKEND_SECRET=1");
  });

  it("renaming Frontend/.env updates only the Frontend tab's id, leaving Backend/.env's tab untouched", async () => {
    const tree = useFileExplorer.getState().templateData!;
    const backendEnv = (tree.items[0] as TemplateFolder).items[0] as any;
    const frontendEnv = (tree.items[1] as TemplateFolder).items[0] as any;

    useFileExplorer.getState().openFile(backendEnv, "Backend", false);
    useFileExplorer.getState().openFile(frontendEnv, "Frontend", false);

    await useFileExplorer
      .getState()
      .handleRenameFile(frontendEnv, ".env", "local", "Frontend", noopSave);

    const { openFiles } = useFileExplorer.getState();
    const backendTab = openFiles.find((f) => f.id === "Backend/.env");
    const renamedTab = openFiles.find((f) => f.id === "Frontend/.env.local");

    expect(backendTab).toBeDefined();
    expect(backendTab!.content).toBe("BACKEND_SECRET=1");
    expect(renamedTab).toBeDefined();
    expect(renamedTab!.content).toBe("FRONTEND_PUBLIC=1");
  });
});
