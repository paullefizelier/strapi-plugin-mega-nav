import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS } from "../fields";
import { walk, type NavNode } from "../tree";
import { normalizeAll } from "../migration/normalize";
import type { OldTables } from "../migration/read";

/**
 * Fixtures mirror the REAL rows found in the source database: two locale rows
 * per navigation with fully duplicated independent items, additional_fields
 * carrying a stringified media object, "true"/"false" strings, and the legacy
 * megaKey; a WRAPPER whose `link` additional field points at a relative path.
 */

const sources = [
  { uid: "api::article.article", pattern: "/actualites/{slug}" },
  { uid: "api::page.page", pattern: "/{path}" },
];

const stringifiedMedia = JSON.stringify({
  id: 2,
  documentId: "bejmxmrq8v7l5puzlv2t60t4",
  name: "ACTUAL-GROUP.png",
  url: "/uploads/actual_group.png",
  alternativeText: "Actual",
  provider: "local",
  isSelectable: true,
  type: "asset",
});

function fixture(): OldTables {
  return {
    navigations: [
      { id: 5, document_id: "doc-b2c", name: "Navigation B2C", slug: "navigation-b2-c", visible: 1, locale: "fr", published_at: "2026-01-01" },
      { id: 6, document_id: "doc-b2c", name: "Navigation B2C", slug: "navigation-b2-c", visible: 1, locale: "en", published_at: "2026-01-01" },
    ],
    items: [
      // fr tree: root WRAPPER with fields, two children
      {
        id: 1,
        title: "Trouver un job",
        type: "WRAPPER",
        path: "/null",
        external_path: null,
        menu_attached: 1,
        order: 1,
        additional_fields: JSON.stringify({
          icon: "i-lucide-megaphone",
          image: stringifiedMedia,
          presentation: "columns",
          highlight: "true",
          megaKey: "trouver-un-job",
        }),
      },
      {
        id: 2,
        title: "Toutes les offres",
        type: "EXTERNAL",
        path: null,
        external_path: "/jobs?family=Manutention",
        menu_attached: 0,
        order: 1,
        additional_fields: "{}",
      },
      {
        id: 3,
        title: "Le blog",
        type: "WRAPPER",
        path: null,
        external_path: null,
        menu_attached: 0,
        order: 2,
        additional_fields: JSON.stringify({ link: "/actualites/mon-article" }),
      },
      {
        id: 4,
        title: "Notre histoire",
        type: "INTERNAL",
        path: "notre-histoire",
        external_path: null,
        menu_attached: 0,
        order: 3,
        additional_fields: "{}",
      },
      // en tree: same structure, translated titles
      { id: 101, title: "Find a job", type: "WRAPPER", path: "/null", external_path: null, menu_attached: 1, order: 1, additional_fields: JSON.stringify({ presentation: "columns" }) },
      { id: 102, title: "All offers", type: "EXTERNAL", path: null, external_path: "/jobs", menu_attached: 0, order: 1, additional_fields: "{}" },
      { id: 103, title: "The blog", type: "WRAPPER", path: null, external_path: null, menu_attached: 0, order: 2, additional_fields: JSON.stringify({ link: "/actualites/my-article" }) },
      // en tree has one item FEWER than fr (no "Notre histoire") — unpaired stays fr-only
    ],
    masters: [
      { navigation_item_id: 1, navigation_id: 5 },
      { navigation_item_id: 2, navigation_id: 5 },
      { navigation_item_id: 3, navigation_id: 5 },
      { navigation_item_id: 4, navigation_id: 5 },
      { navigation_item_id: 101, navigation_id: 6 },
      { navigation_item_id: 102, navigation_id: 6 },
      { navigation_item_id: 103, navigation_id: 6 },
    ],
    parents: [
      { navigation_item_id: 2, inv_navigation_item_id: 1 },
      { navigation_item_id: 3, inv_navigation_item_id: 1 },
      { navigation_item_id: 4, inv_navigation_item_id: 1 },
      { navigation_item_id: 102, inv_navigation_item_id: 101 },
      { navigation_item_id: 103, inv_navigation_item_id: 101 },
    ],
    related: {
      4: [{ uid: "api::page.page", documentId: "doc-histoire" }],
    },
  };
}

describe("normalizeAll", () => {
  const [nav] = normalizeAll(fixture(), sources, DEFAULT_FIELDS, { defaultLocale: "fr" });

  it("groups locale rows of one document into ONE navigation with two locale trees", () => {
    expect(nav.slug).toBe("navigation-b2-c");
    expect(Object.keys(nav.locales).sort()).toEqual(["en", "fr"]);
    expect(nav.reports.fr.items).toBe(4);
    expect(nav.reports.en.items).toBe(3);
  });

  it("rebuilds the hierarchy from the link tables, ordered by `order`", () => {
    const fr = nav.locales.fr;
    expect(fr).toHaveLength(1);
    expect(fr[0].title).toBe("Trouver un job");
    expect(fr[0].children.map((c) => c.title)).toEqual([
      "Toutes les offres",
      "Le blog",
      "Notre histoire",
    ]);
  });

  it("pairs node ids across locales by tree position", () => {
    const fr = nav.locales.fr;
    const en = nav.locales.en;
    expect(en[0].id).toBe(fr[0].id);
    expect(en[0].children[0].id).toBe(fr[0].children[0].id);
    expect(en[0].children[1].id).toBe(fr[0].children[1].id);
    // fr has one extra child at position 3 — nothing to pair with, own id.
    expect(nav.reports.en.unpaired).toBe(0);
    expect(nav.reports.fr.unpaired).toBe(0);
  });

  it("normalizes the WRAPPER-with-/null root to a wrapper link", () => {
    expect(nav.locales.fr[0].link).toEqual({ kind: "none" });
  });

  it("keeps the relative EXTERNAL as a pending reverse-match with its query", () => {
    const pending = nav.pending.find((p) => p.rawPath.startsWith("/jobs") && p.locale === "fr");
    expect(pending).toMatchObject({
      uid: "api::page.page",
      field: "path",
      value: "jobs",
      query: "family=Manutention",
      locale: "fr",
    });
  });

  it("routes the legacy `link` escape hatch through reverse-matching too", () => {
    const pending = nav.pending.find((p) => p.rawPath === "/actualites/mon-article");
    expect(pending).toMatchObject({
      uid: "api::article.article",
      field: "slug",
      value: "mon-article",
      locale: "fr",
    });
  });

  it("turns INTERNAL + related morph into a real internal link", () => {
    const histoire = nav.locales.fr[0].children[2];
    expect(histoire.link).toEqual({
      kind: "internal",
      uid: "api::page.page",
      documentId: "doc-histoire",
    });
  });

  it("decodes the stringified media, coerces string booleans and preserves megaKey", () => {
    const fields = nav.locales.fr[0].fields;
    expect(fields.image).toEqual({
      media: {
        id: 2,
        documentId: "bejmxmrq8v7l5puzlv2t60t4",
        url: "/uploads/actual_group.png",
        alternativeText: "Actual",
      },
    });
    expect(fields.highlight).toBe(true);
    expect(fields.megaKey).toBe("trouver-un-job");
    expect(fields.link).toBeUndefined(); // absorbed into the typed link
    expect(nav.reports.fr.booleansCoerced).toBe(1);
    expect(nav.reports.fr.mediaDecoded).toBe(1);
    expect(nav.reports.fr.unknownFieldKeys).toEqual(["megaKey"]);
  });

  it("reports menu-detached roots instead of hiding them — the old front never filtered on it", () => {
    expect(nav.reports.fr.menuDetachedRoots).toEqual([]);
    let hiddenCount = 0;
    for (const tree of Object.values(nav.locales)) {
      walk(tree as NavNode[], (node) => {
        if (node.hidden) hiddenCount += 1;
      });
    }
    expect(hiddenCount).toBe(0);
  });

  it("prefers the published navigation row when draft and published rows coexist", () => {
    const tables = fixture();
    tables.navigations.push({
      id: 9,
      document_id: "doc-b2c",
      name: "Navigation B2C (draft)",
      slug: "navigation-b2-c",
      visible: 1,
      locale: "fr",
      published_at: null,
    });
    const [dedup] = normalizeAll(tables, sources, DEFAULT_FIELDS, { defaultLocale: "fr" });
    expect(Object.keys(dedup.locales).sort()).toEqual(["en", "fr"]);
    expect(dedup.name).toBe("Navigation B2C");
  });
});
