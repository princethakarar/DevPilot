import { describe, it, expect } from "vitest";
import { computeTabLabels, type TabFileRef } from "../tab-labels";

const ref = (id: string): TabFileRef => {
  const bare = id.split("/").pop()!;
  const lastDot = bare.lastIndexOf(".");
  const [filename, fileExtension] =
    lastDot > 0 ? [bare.slice(0, lastDot), bare.slice(lastDot + 1)] : [bare, ""];
  return { id, filename, fileExtension };
};

describe("computeTabLabels", () => {
  it("gives a root-level file no folder hint (nothing to show)", () => {
    const labels = computeTabLabels([ref("index.ts")]);
    const label = labels.get("index.ts")!;
    expect(label.folderHint).toBe("");
    expect(label.fileName).toBe("index.ts");
    expect(label.fullPath).toBe("index.ts");
  });

  it("always shows the immediate parent folder for a non-root file, even with no collision", () => {
    const labels = computeTabLabels([ref("Backend/app.ts"), ref("index.ts")]);
    const backend = labels.get("Backend/app.ts")!;
    expect(backend.folderHint).toBe("Backend");
    expect(backend.fileName).toBe("app.ts");
    expect(backend.fullPath).toBe("Backend/app.ts");

    // Unrelated root file is unaffected.
    expect(labels.get("index.ts")!.folderHint).toBe("");
  });

  it("disambiguates two open tabs with the same bare filename using the immediate parent folder", () => {
    const labels = computeTabLabels([ref("Backend/.env"), ref("Frontend/.env")]);
    expect(labels.get("Backend/.env")!.folderHint).toBe("Backend");
    expect(labels.get("Frontend/.env")!.folderHint).toBe("Frontend");
  });

  it("is reactive: closing one colliding tab still leaves the remaining tab's own immediate-parent hint (always-on, not collision-only)", () => {
    const withBoth = computeTabLabels([ref("Backend/.env"), ref("Frontend/.env")]);
    expect(withBoth.get("Backend/.env")!.folderHint).toBe("Backend");

    const afterClosingOne = computeTabLabels([ref("Backend/.env")]);
    expect(afterClosingOne.get("Backend/.env")!.folderHint).toBe("Backend");
  });

  it("falls back to more path segments when immediate parents also collide", () => {
    const labels = computeTabLabels([
      ref("apps/api/Backend/.env"),
      ref("apps/web/Backend/.env"),
    ]);
    expect(labels.get("apps/api/Backend/.env")!.folderHint).toBe("api/Backend");
    expect(labels.get("apps/web/Backend/.env")!.folderHint).toBe("web/Backend");
  });

  it("keeps disambiguating up to the full path if needed for a 3-way collision", () => {
    const labels = computeTabLabels([
      ref("a/x/Backend/.env"),
      ref("a/y/Backend/.env"),
      ref("b/y/Backend/.env"),
    ]);
    const hints = new Set([...labels.values()].map((l) => l.folderHint));
    expect(hints.size).toBe(3);
  });

  it("only disambiguates the colliding group, leaving unrelated tabs at their default depth", () => {
    const labels = computeTabLabels([ref("Backend/.env"), ref("Frontend/.env"), ref("Backend/index.ts")]);
    expect(labels.get("Backend/index.ts")!.folderHint).toBe("Backend");
  });

  it("matches bare names case-insensitively when grouping for disambiguation", () => {
    const labels = computeTabLabels([ref("Backend/README.md"), ref("Frontend/readme.md")]);
    expect(labels.get("Backend/README.md")!.folderHint).toBe("Backend");
    expect(labels.get("Frontend/readme.md")!.folderHint).toBe("Frontend");
  });

  it("always exposes the full untruncated path for a tooltip, regardless of folder depth shown", () => {
    const labels = computeTabLabels([ref("apps/api/Backend/.env"), ref("apps/web/Backend/.env")]);
    expect(labels.get("apps/api/Backend/.env")!.fullPath).toBe("apps/api/Backend/.env");
    expect(labels.get("apps/web/Backend/.env")!.fullPath).toBe("apps/web/Backend/.env");
  });
});
