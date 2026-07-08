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
  it("keeps the bare filename when there is no collision", () => {
    const labels = computeTabLabels([ref("index.ts"), ref("Backend/app.ts")]);
    expect(labels.get("index.ts")).toBe("index.ts");
    expect(labels.get("Backend/app.ts")).toBe("app.ts");
  });

  it("disambiguates two open tabs with the same bare filename using the immediate parent folder", () => {
    const labels = computeTabLabels([ref("Backend/.env"), ref("Frontend/.env")]);
    expect(labels.get("Backend/.env")).toBe("Backend/.env");
    expect(labels.get("Frontend/.env")).toBe("Frontend/.env");
  });

  it("is reactive: closing one colliding tab reverts the remaining tab to its bare name", () => {
    const withBoth = computeTabLabels([ref("Backend/.env"), ref("Frontend/.env")]);
    expect(withBoth.get("Backend/.env")).toBe("Backend/.env");

    const afterClosingOne = computeTabLabels([ref("Backend/.env")]);
    expect(afterClosingOne.get("Backend/.env")).toBe(".env");
  });

  it("falls back to more path segments when immediate parents also collide", () => {
    const labels = computeTabLabels([
      ref("apps/api/Backend/.env"),
      ref("apps/web/Backend/.env"),
    ]);
    expect(labels.get("apps/api/Backend/.env")).toBe("api/Backend/.env");
    expect(labels.get("apps/web/Backend/.env")).toBe("web/Backend/.env");
  });

  it("keeps disambiguating up to the full path if needed for a 3-way collision", () => {
    const labels = computeTabLabels([
      ref("a/x/Backend/.env"),
      ref("a/y/Backend/.env"),
      ref("b/y/Backend/.env"),
    ]);
    const values = new Set(labels.values());
    expect(values.size).toBe(3);
  });

  it("only disambiguates the colliding group, leaving unrelated tabs untouched", () => {
    const labels = computeTabLabels([ref("Backend/.env"), ref("Frontend/.env"), ref("index.ts")]);
    expect(labels.get("index.ts")).toBe("index.ts");
  });

  it("matches bare names case-insensitively", () => {
    const labels = computeTabLabels([ref("Backend/README.md"), ref("Frontend/readme.md")]);
    expect(labels.get("Backend/README.md")).toBe("Backend/README.md");
    expect(labels.get("Frontend/readme.md")).toBe("Frontend/readme.md");
  });
});
