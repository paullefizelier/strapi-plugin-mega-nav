import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS } from "../fields";
import { fnv1a, renderV1, renderV2, type RenderContext } from "../render";
import type { NavNode } from "../tree";

/**
 * The v1 serializer IS the compat contract with fronts built for
 * strapi-plugin-navigation — these tests pin it: nested additionalFields,
 * clean per-item paths, real booleans, absolute media, WRAPPER degradation.
 */

const sources = {
  "api::page.page": { uid: "api::page.page", titleField: "title", pattern: "/{path}" },
  "api::equipe.equipe": {
    uid: "api::equipe.equipe",
    titleField: "entity",
    pattern: "/agences/{slug}",
    related: { fields: ["entity", "color"], populate: ["logo"] },
  },
};

const resolved = {
  entries: {
    "api::page.page": {
      "doc-jobs": { documentId: "doc-jobs", title: "Jobs", path: "jobs" },
    },
    "api::equipe.equipe": {
      "doc-team": {
        documentId: "doc-team",
        entity: "Actual Talent",
        color: "#ff0000",
        slug: "actual-talent",
        logo: { id: 4, url: "/uploads/logo.png", alternativeText: "logo" },
      },
    },
  },
  media: {
    7: {
      id: 7,
      url: "/uploads/promo.png",
      alternativeText: "Promo",
      width: 1200,
      height: 630,
      formats: { small: { url: "/uploads/small_promo.png", width: 500 } },
    },
  },
};

const ctx: RenderContext = {
  resolved,
  sources,
  fieldDefs: DEFAULT_FIELDS,
  locale: "fr",
  baseUrl: "https://cms.example.com",
  emitLegacyLinkField: true,
};

const tree: NavNode[] = [
  {
    id: "root-1",
    title: "Trouver un job",
    link: { kind: "none" },
    fields: {
      presentation: "columns",
      highlight: true,
      image: { media: { id: 7, documentId: "m7" } },
    },
    children: [
      {
        id: "child-internal",
        title: "Toutes les offres",
        link: { kind: "internal", uid: "api::page.page", documentId: "doc-jobs", query: "family=Manutention" },
        fields: {},
        children: [],
      },
      {
        id: "child-external",
        title: "LinkedIn",
        link: { kind: "external", url: "https://linkedin.com/company/actual" },
        fields: {},
        children: [],
      },
      {
        id: "child-path",
        title: "Jobboard filtré",
        link: { kind: "path", path: "/jobs?q=cariste" },
        fields: {},
        children: [],
      },
      {
        id: "child-broken",
        title: "Page supprimée",
        link: { kind: "internal", uid: "api::page.page", documentId: "doc-gone" },
        fields: {},
        children: [
          { id: "grandchild", title: "Sous-lien", link: { kind: "none" }, fields: {}, children: [] },
        ],
      },
      {
        id: "child-hidden",
        title: "Caché",
        link: { kind: "none" },
        fields: {},
        hidden: true,
        children: [],
      },
      {
        id: "child-team",
        title: "Actual Talent",
        link: { kind: "internal", uid: "api::equipe.equipe", documentId: "doc-team" },
        fields: {},
        children: [],
      },
    ],
  },
];

describe("renderV1", () => {
  const [root] = renderV1(tree, ctx);
  const items = root.items as Record<string, unknown>[];
  const byTitle = (title: string) => items.find((i) => i.title === title)!;

  it("maps link kinds onto the old type trio with clean per-item paths", () => {
    expect(root.type).toBe("WRAPPER");
    expect(root.path).toBeUndefined();

    const internal = byTitle("Toutes les offres");
    expect(internal.type).toBe("INTERNAL");
    // Path resolved from the entry + the link's own query — no ancestor
    // concatenation, no /null, ever.
    expect(internal.path).toBe("/jobs?family=Manutention");

    const external = byTitle("LinkedIn");
    expect(external.type).toBe("EXTERNAL");
    expect(external.externalPath).toBe("https://linkedin.com/company/actual");

    const path = byTitle("Jobboard filtré");
    expect(path.type).toBe("INTERNAL");
    expect(path.path).toBe("/jobs?q=cariste");
  });

  it("degrades a broken internal link to WRAPPER, children kept", () => {
    const broken = byTitle("Page supprimée");
    expect(broken.type).toBe("WRAPPER");
    expect(broken.path).toBeUndefined();
    expect((broken.items as unknown[]).length).toBe(1);
  });

  it("omits broken items entirely under dropBrokenLinks", () => {
    const [r] = renderV1(tree, { ...ctx, dropBrokenLinks: true });
    const titles = (r.items as { title: string }[]).map((i) => i.title);
    expect(titles).not.toContain("Page supprimée");
  });

  it("excludes hidden items", () => {
    expect(items.map((i) => i.title)).not.toContain("Caché");
  });

  it("nests additionalFields with real booleans and absolute media carrying formats", () => {
    const af = root.additionalFields as Record<string, unknown>;
    expect(af.presentation).toBe("columns");
    expect(af.highlight).toBe(true);
    expect(af.image).toEqual({
      url: "https://cms.example.com/uploads/promo.png",
      alternativeText: "Promo",
      width: 1200,
      height: 630,
      formats: { small: { url: "https://cms.example.com/uploads/small_promo.png", width: 500 } },
    });
  });

  it("mirrors resolved hrefs into additionalFields.link (escape-hatch compat)", () => {
    expect((byTitle("Toutes les offres").additionalFields as Record<string, unknown>).link).toBe(
      "/jobs?family=Manutention",
    );
    expect((byTitle("Jobboard filtré").additionalFields as Record<string, unknown>).link).toBe(
      "/jobs?q=cariste",
    );
    // External links already ride externalPath; no shim.
    expect((byTitle("LinkedIn").additionalFields as Record<string, unknown>).link).toBeUndefined();
  });

  it("exposes `related` for sources configured with related data", () => {
    const related = byTitle("Actual Talent").related as Record<string, unknown>;
    expect(related.__type).toBe("api::equipe.equipe");
    expect(related.entity).toBe("Actual Talent");
    expect(related.color).toBe("#ff0000");
    expect(related.logo).toMatchObject({ url: "https://cms.example.com/uploads/logo.png" });
  });

  it("keys items on a stable numeric hash of the node id", () => {
    expect(root.id).toBe(fnv1a("root-1"));
    expect(renderV1(tree, ctx)[0].id).toBe(root.id);
  });

  it("caps the tree at maxDepth", () => {
    const deep: NavNode[] = [
      {
        id: "a",
        title: "A",
        link: { kind: "none" },
        fields: {},
        children: [
          {
            id: "b",
            title: "B",
            link: { kind: "none" },
            fields: {},
            children: [{ id: "c", title: "C", link: { kind: "none" }, fields: {}, children: [] }],
          },
        ],
      },
    ];
    const [a] = renderV1(deep, { ...ctx, maxDepth: 2 });
    const [b] = a.items as Record<string, unknown>[];
    expect(b.items).toEqual([]);
  });
});

describe("renderV2", () => {
  const [root] = renderV2(tree, ctx);

  it("emits a typed link object and flattened fields", () => {
    expect(root.id).toBe("root-1");
    expect(root.link).toEqual({ kind: "none" });
    const child = (root.children as Record<string, unknown>[]).find(
      (c) => c.title === "Toutes les offres",
    )!;
    expect(child.link).toEqual({
      kind: "internal",
      href: "/jobs?family=Manutention",
      query: "family=Manutention",
    });
  });

  it("prunes fields by per-level relevance", () => {
    // presentation is declared levels:[1] — a child carrying it is pruned.
    const polluted: NavNode[] = [
      {
        id: "p1",
        title: "Root",
        link: { kind: "none" },
        fields: { presentation: "simple" },
        children: [
          {
            id: "p2",
            title: "Child",
            link: { kind: "none" },
            fields: { presentation: "columns", description: "kept" },
            children: [],
          },
        ],
      },
    ];
    const [r] = renderV2(polluted, ctx);
    expect((r.fields as Record<string, unknown>).presentation).toBe("simple");
    const [child] = r.children as Record<string, unknown>[];
    expect((child.fields as Record<string, unknown>).presentation).toBeUndefined();
    expect((child.fields as Record<string, unknown>).description).toBe("kept");
  });
});
