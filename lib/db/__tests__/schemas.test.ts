import { describe, it, expect } from "vitest";
import {
  newId,
  UserCreateInputSchema,
  AccountCreateInputSchema,
  PlaygroundCreateInputSchema,
  PlaygroundEnvVarCreateInputSchema,
  StarMarkCreateInputSchema,
  TemplateFileCreateInputSchema,
  ChatMessageCreateInputSchema,
} from "../schemas";

describe("newId", () => {
  it("produces a non-empty string", () => {
    expect(typeof newId()).toBe("string");
    expect(newId().length).toBeGreaterThan(0);
  });

  it("produces distinct ids across calls", () => {
    expect(newId()).not.toBe(newId());
  });
});

describe("UserCreateInputSchema", () => {
  it("accepts the minimal required shape and defaults role to USER", () => {
    const parsed = UserCreateInputSchema.parse({ email: "ada@example.com" });
    expect(parsed).toEqual({ email: "ada@example.com", role: "USER" });
  });

  it("rejects a missing email (required, matches Prisma's non-optional field)", () => {
    expect(() => UserCreateInputSchema.parse({})).toThrow();
  });

  it("rejects a malformed email (matches no @unique format constraint but a sane email shape)", () => {
    expect(() => UserCreateInputSchema.parse({ email: "not-an-email" })).toThrow();
  });

  it("accepts explicit null for nullable name/image", () => {
    const parsed = UserCreateInputSchema.parse({ email: "a@b.com", name: null, image: null });
    expect(parsed.name).toBeNull();
    expect(parsed.image).toBeNull();
  });

  it("accepts an omitted name/image (caller may leave them out entirely)", () => {
    const parsed = UserCreateInputSchema.parse({ email: "a@b.com" });
    expect(parsed.name).toBeUndefined();
    expect(parsed.image).toBeUndefined();
  });

  it("rejects a role outside the UserRole enum", () => {
    expect(() => UserCreateInputSchema.parse({ email: "a@b.com", role: "SUPERADMIN" })).toThrow();
  });

  it("accepts every valid UserRole enum value", () => {
    for (const role of ["ADMIN", "USER", "PREMIUM_USER"]) {
      expect(UserCreateInputSchema.parse({ email: "a@b.com", role }).role).toBe(role);
    }
  });
});

describe("AccountCreateInputSchema", () => {
  const base = {
    userId: "u1",
    type: "oauth",
    provider: "github",
    providerAccountId: "12345",
  };

  it("accepts the minimal required shape", () => {
    expect(() => AccountCreateInputSchema.parse(base)).not.toThrow();
  });

  it("rejects a missing required field (userId, type, provider, providerAccountId)", () => {
    for (const key of ["userId", "type", "provider", "providerAccountId"] as const) {
      const { [key]: _omit, ...rest } = base;
      expect(() => AccountCreateInputSchema.parse(rest)).toThrow();
    }
  });

  it("rejects an empty-string required field (min(1) matches Prisma's non-optional String)", () => {
    expect(() => AccountCreateInputSchema.parse({ ...base, providerAccountId: "" })).toThrow();
  });

  it("accepts all nullable OAuth fields omitted, null, or populated", () => {
    expect(() => AccountCreateInputSchema.parse(base)).not.toThrow();
    expect(() =>
      AccountCreateInputSchema.parse({
        ...base,
        refreshToken: null,
        accessToken: null,
        expiresAt: null,
        tokenType: null,
        scope: null,
        idToken: null,
        sessionState: null,
      })
    ).not.toThrow();
    expect(() =>
      AccountCreateInputSchema.parse({ ...base, accessToken: "tok", expiresAt: 1700000000 })
    ).not.toThrow();
  });

  it("rejects a non-integer expiresAt (matches Prisma's Int type)", () => {
    expect(() => AccountCreateInputSchema.parse({ ...base, expiresAt: 1.5 })).toThrow();
  });
});

describe("PlaygroundCreateInputSchema", () => {
  const base = { title: "My Project", userId: "u1" };

  it("accepts the minimal required shape and defaults template to NODE", () => {
    const parsed = PlaygroundCreateInputSchema.parse(base);
    expect(parsed.template).toBe("NODE");
  });

  it("rejects a missing title or userId", () => {
    expect(() => PlaygroundCreateInputSchema.parse({ userId: "u1" })).toThrow();
    expect(() => PlaygroundCreateInputSchema.parse({ title: "x" })).toThrow();
  });

  it("rejects an empty title (min(1))", () => {
    expect(() => PlaygroundCreateInputSchema.parse({ ...base, title: "" })).toThrow();
  });

  it("rejects a template outside the Templates enum", () => {
    expect(() => PlaygroundCreateInputSchema.parse({ ...base, template: "SVELTE" })).toThrow();
  });

  it("accepts every valid Templates enum value", () => {
    for (const template of ["REACT", "NEXTJS", "EXPRESS", "VUE", "HONO", "ANGULAR", "NODE"]) {
      expect(PlaygroundCreateInputSchema.parse({ ...base, template }).template).toBe(template);
    }
  });

  it("accepts nullable GitHub fields omitted or null", () => {
    expect(() => PlaygroundCreateInputSchema.parse(base)).not.toThrow();
    expect(() =>
      PlaygroundCreateInputSchema.parse({
        ...base,
        description: null,
        githubRepo: null,
        githubBranch: null,
        githubBaseContent: null,
      })
    ).not.toThrow();
  });
});

describe("PlaygroundEnvVarCreateInputSchema", () => {
  it("accepts a well-formed env var row", () => {
    expect(() =>
      PlaygroundEnvVarCreateInputSchema.parse({ playgroundId: "p1", key: "API_KEY", value: "secret" })
    ).not.toThrow();
  });

  it("allows an empty string value (Prisma's `value String` has no min-length constraint)", () => {
    expect(() =>
      PlaygroundEnvVarCreateInputSchema.parse({ playgroundId: "p1", key: "EMPTY", value: "" })
    ).not.toThrow();
  });

  it("rejects an empty key (min(1))", () => {
    expect(() =>
      PlaygroundEnvVarCreateInputSchema.parse({ playgroundId: "p1", key: "", value: "x" })
    ).toThrow();
  });

  it("rejects a missing playgroundId", () => {
    expect(() => PlaygroundEnvVarCreateInputSchema.parse({ key: "A", value: "x" })).toThrow();
  });
});

describe("StarMarkCreateInputSchema", () => {
  it("accepts a well-formed row", () => {
    expect(() =>
      StarMarkCreateInputSchema.parse({ userId: "u1", playgroundId: "p1", isMarked: true })
    ).not.toThrow();
  });

  it("rejects a non-boolean isMarked", () => {
    expect(() =>
      StarMarkCreateInputSchema.parse({ userId: "u1", playgroundId: "p1", isMarked: "true" })
    ).toThrow();
  });

  it("rejects missing userId or playgroundId", () => {
    expect(() => StarMarkCreateInputSchema.parse({ playgroundId: "p1", isMarked: true })).toThrow();
    expect(() => StarMarkCreateInputSchema.parse({ userId: "u1", isMarked: true })).toThrow();
  });
});

describe("TemplateFileCreateInputSchema", () => {
  it("accepts any JSON-serializable content (matches Prisma's `content Json`)", () => {
    expect(() =>
      TemplateFileCreateInputSchema.parse({ playgroundId: "p1", content: { items: [] } })
    ).not.toThrow();
    expect(() =>
      TemplateFileCreateInputSchema.parse({ playgroundId: "p1", content: "raw-json-string" })
    ).not.toThrow();
  });

  it("rejects a missing playgroundId", () => {
    expect(() => TemplateFileCreateInputSchema.parse({ content: {} })).toThrow();
  });
});

describe("ChatMessageCreateInputSchema", () => {
  it("accepts a well-formed row", () => {
    expect(() =>
      ChatMessageCreateInputSchema.parse({ userId: "u1", role: "user", content: "hello" })
    ).not.toThrow();
  });

  it("rejects an empty role or missing content", () => {
    expect(() =>
      ChatMessageCreateInputSchema.parse({ userId: "u1", role: "", content: "hello" })
    ).toThrow();
    expect(() => ChatMessageCreateInputSchema.parse({ userId: "u1", role: "user" })).toThrow();
  });
});
