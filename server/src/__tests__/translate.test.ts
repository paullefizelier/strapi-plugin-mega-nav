import { describe, expect, it } from "vitest";
import { parseArrayAnswer } from "../ai";
import { DEFAULT_FIELDS, isTranslatable, type FieldDef } from "../fields";
import { applyTranslations, internalRefs, planTranslation } from "../translate";
import type { NavNode } from "../tree";

const node = (title: string, partial: Partial<NavNode> = {}): NavNode => ({
  id: `id-${title}`,
  title,
  link: { kind: "none" },
  fields: {},
  children: [],
  ...partial,
});

const defs = DEFAULT_FIELDS;

describe("isTranslatable", () => {
  it("translates prose and leaves identifiers alone", () => {
    const by = (name: string) => defs.find((d) => d.name === name);
    expect(isTranslatable(by("description"))).toBe(true);
    expect(isTranslatable(by("tagline"))).toBe(true);
    expect(isTranslatable(by("ctaLabel"))).toBe(true);
    // Identifiers: an icon id, a lookup key, a URL, a layout key, a media, a flag.
    expect(isTranslatable(by("icon"))).toBe(false);
    expect(isTranslatable(by("offerBrand"))).toBe(false);
    expect(isTranslatable(by("ctaUrl"))).toBe(false);
    expect(isTranslatable(by("presentation"))).toBe(false);
    expect(isTranslatable(by("image"))).toBe(false);
    expect(isTranslatable(by("highlight"))).toBe(false);
  });

  it("honours an explicit flag and skips disabled or unknown fields", () => {
    expect(isTranslatable({ name: "x", type: "url", label: "x", translatable: true })).toBe(true);
    expect(isTranslatable({ name: "x", type: "string", label: "x", translatable: false })).toBe(false);
    expect(isTranslatable({ name: "x", type: "string", label: "x", disabled: true })).toBe(false);
    expect(isTranslatable(undefined)).toBe(false);
  });
});

describe("planTranslation", () => {
  const source = [
    node("Trouver un job", {
      fields: {
        presentation: "columns",
        description: "Toutes nos offres",
        icon: "i-lucide-briefcase",
        highlight: true,
      },
      children: [
        node("Par secteur", {
          link: { kind: "internal", uid: "api::page.page", documentId: "doc-1" },
          fields: { tagline: "Nos métiers" },
        }),
      ],
    }),
  ];

  it("queues prose and copies identifiers untouched", () => {
    const plan = planTranslation(source, [], defs);
    expect(plan.pending.map((p) => p.text).sort()).toEqual(
      ["Nos métiers", "Par secteur", "Toutes nos offres", "Trouver un job"].sort(),
    );
    const root = plan.tree[0];
    expect(root.fields.presentation).toBe("columns");
    expect(root.fields.icon).toBe("i-lucide-briefcase");
    expect(root.fields.highlight).toBe(true);
  });

  it("keeps the structure, the links and the ids of the source", () => {
    const plan = planTranslation(source, [], defs);
    expect(plan.tree[0].id).toBe(source[0].id);
    expect(plan.tree[0].children[0].link).toEqual({
      kind: "internal",
      uid: "api::page.page",
      documentId: "doc-1",
    });
  });

  it("leaves already-translated text alone by default", () => {
    const target = [
      node("Find a job", {
        id: "id-Trouver un job",
        fields: { description: "All our offers" },
        children: [node("By sector", { id: "id-Par secteur", fields: {} })],
      }),
    ];
    const plan = planTranslation(source, target, defs);
    expect(plan.tree[0].title).toBe("Find a job");
    expect(plan.tree[0].fields.description).toBe("All our offers");
    expect(plan.kept).toBe(3); // two titles + one description
    // Only the untranslated tagline is queued.
    expect(plan.pending.map((p) => p.text)).toEqual(["Nos métiers"]);
  });

  it("retranslates everything when asked", () => {
    const target = [node("Find a job", { id: "id-Trouver un job", fields: { description: "All our offers" } })];
    const plan = planTranslation(source, target, defs, { overwrite: true });
    expect(plan.kept).toBe(0);
    expect(plan.pending).toHaveLength(4);
  });

  it("treats blank target text as a gap to fill", () => {
    const target = [node("   ", { id: "id-Trouver un job", fields: { description: "" } })];
    const plan = planTranslation(source, target, defs);
    expect(plan.pending.some((p) => p.key === "title" && p.text === "Trouver un job")).toBe(true);
    expect(plan.pending.some((p) => p.key === "description")).toBe(true);
  });

  it("keeps the target's own hidden flag", () => {
    const target = [node("Find a job", { id: "id-Trouver un job", hidden: true })];
    expect(planTranslation(source, target, defs).tree[0].hidden).toBe(true);
  });
});

describe("applyTranslations", () => {
  it("writes answers back by node and key", () => {
    const plan = planTranslation(
      [node("Accueil", { fields: { description: "Bienvenue" } })],
      [],
      defs,
    );
    const answers = plan.pending.map((p) => (p.key === "title" ? "Home" : "Welcome"));
    const { tree, applied } = applyTranslations(plan.tree, plan.pending, answers);
    expect(tree[0].title).toBe("Home");
    expect(tree[0].fields.description).toBe("Welcome");
    expect(applied).toBe(2);
  });

  it("leaves the source text in place for missing or blank answers", () => {
    const plan = planTranslation([node("Accueil", { fields: { description: "Bienvenue" } })], [], defs);
    const answers = plan.pending.map((p) => (p.key === "title" ? undefined : "   "));
    const { tree, applied } = applyTranslations(plan.tree, plan.pending, answers);
    expect(tree[0].title).toBe("Accueil");
    expect(tree[0].fields.description).toBe("Bienvenue");
    expect(applied).toBe(0);
  });

  it("translates at any depth", () => {
    const source = [node("A", { children: [node("B", { children: [node("C")] })] })];
    const plan = planTranslation(source, [], defs);
    const { tree } = applyTranslations(
      plan.tree,
      plan.pending,
      plan.pending.map((p) => `${p.text}-en`),
    );
    expect(tree[0].children[0].children[0].title).toBe("C-en");
  });
});

describe("internalRefs", () => {
  it("lists each referenced entry once, at any depth", () => {
    const tree = [
      node("A", {
        link: { kind: "internal", uid: "api::page.page", documentId: "p1" },
        children: [
          node("B", { link: { kind: "internal", uid: "api::page.page", documentId: "p1" } }),
          node("C", { link: { kind: "internal", uid: "api::sector.sector", documentId: "s1" } }),
          node("D", { link: { kind: "external", url: "https://x.test" } }),
        ],
      }),
    ];
    expect(internalRefs(tree)).toEqual([
      { uid: "api::page.page", documentId: "p1" },
      { uid: "api::sector.sector", documentId: "s1" },
    ]);
  });
});

describe("parseArrayAnswer", () => {
  it("reads a plain array", () => {
    expect(parseArrayAnswer('["Home","Jobs"]', 2)).toEqual(["Home", "Jobs"]);
  });

  it("reads a fenced array and one wrapped in prose", () => {
    expect(parseArrayAnswer('```json\n["Home","Jobs"]\n```', 2)).toEqual(["Home", "Jobs"]);
    expect(parseArrayAnswer('Sure! ["Home","Jobs"] — hope this helps', 2)).toEqual(["Home", "Jobs"]);
  });

  it("pads a short answer and drops non-strings, never throwing", () => {
    expect(parseArrayAnswer('["Home"]', 3)).toEqual(["Home", undefined, undefined]);
    expect(parseArrayAnswer('["Home",42,"Jobs"]', 3)).toEqual(["Home", undefined, "Jobs"]);
    expect(parseArrayAnswer("not json at all", 2)).toEqual([undefined, undefined]);
    expect(parseArrayAnswer('{"a":1}', 2)).toEqual([undefined, undefined]);
  });
});
