import { describe, expect, it } from "vitest";
import { collectRefs, newNodeId, validateTree, walk, type NavNode } from "../tree";
import { DEFAULT_FIELDS } from "../fields";

const node = (partial: Partial<NavNode>): NavNode => ({
  id: newNodeId(),
  title: "Item",
  link: { kind: "none" },
  fields: {},
  children: [],
  ...partial,
});

describe("validateTree", () => {
  it("accepts a well-formed tree", () => {
    const tree = [
      node({
        title: "Trouver un job",
        fields: { presentation: "columns", highlight: true },
        children: [
          node({
            title: "Secteurs",
            children: [
              node({
                title: "Industrie",
                link: { kind: "internal", uid: "api::sector.sector", documentId: "abc" },
              }),
            ],
          }),
        ],
      }),
    ];
    expect(validateTree(tree, DEFAULT_FIELDS)).toEqual([]);
  });

  it("rejects a non-array", () => {
    expect(validateTree({}, DEFAULT_FIELDS)).toEqual(["items must be an array"]);
  });

  it("flags depth beyond maxDepth", () => {
    const deep = [node({ children: [node({ children: [node({ children: [node({})] })] })] })];
    expect(validateTree(deep, DEFAULT_FIELDS, { maxDepth: 3 }).join()).toContain("exceeds maxDepth");
    expect(validateTree(deep, DEFAULT_FIELDS, { maxDepth: 4 })).toEqual([]);
  });

  it("flags duplicate ids — they are the i18n pairing key", () => {
    const id = newNodeId();
    const tree = [node({ id }), node({ id })];
    expect(validateTree(tree, DEFAULT_FIELDS).join()).toContain("duplicate id");
  });

  it("flags malformed links", () => {
    expect(validateTree([node({ link: { kind: "internal" } as never })], DEFAULT_FIELDS).join()).toContain(
      "needs uid and documentId",
    );
    expect(validateTree([node({ link: { kind: "external", url: " " } as never })], DEFAULT_FIELDS).join()).toContain(
      "needs a url",
    );
    expect(validateTree([node({ link: { kind: "path", path: "no-slash" } as never })], DEFAULT_FIELDS).join()).toContain(
      'starting with "/"',
    );
    expect(validateTree([node({ link: { kind: "banana" } as never })], DEFAULT_FIELDS).join()).toContain(
      "unknown link kind",
    );
  });

  it("checks field values against their definitions", () => {
    expect(
      validateTree([node({ fields: { highlight: "true" as never } })], DEFAULT_FIELDS).join(),
    ).toContain("must be a boolean");
    expect(
      validateTree([node({ fields: { presentation: "hexagonal" } })], DEFAULT_FIELDS).join(),
    ).toContain("is not one of");
    expect(
      validateTree([node({ fields: { image: { media: { id: 3, documentId: "m" } } } })], DEFAULT_FIELDS),
    ).toEqual([]);
    expect(
      validateTree([node({ fields: { image: "not-a-media" as never } })], DEFAULT_FIELDS).join(),
    ).toContain("must be { media:");
  });

  it("tolerates unknown field keys — legacy data survives", () => {
    expect(validateTree([node({ fields: { megaKey: "trouver-un-job" } })], DEFAULT_FIELDS)).toEqual([]);
  });
});

describe("collectRefs / walk", () => {
  it("collects internal refs grouped by uid and media ids at any depth", () => {
    const tree = [
      node({
        link: { kind: "internal", uid: "api::page.page", documentId: "p1" },
        fields: { image: { media: { id: 7, documentId: "m7" } } },
        children: [
          node({ link: { kind: "internal", uid: "api::page.page", documentId: "p2" } }),
          node({
            link: { kind: "internal", uid: "api::sector.sector", documentId: "s1" },
            fields: { image: { media: { id: 9, documentId: "m9" } } },
          }),
        ],
      }),
    ];
    const refs = collectRefs(tree);
    expect([...refs.internal["api::page.page"]]).toEqual(["p1", "p2"]);
    expect([...refs.internal["api::sector.sector"]]).toEqual(["s1"]);
    expect([...refs.mediaIds].sort()).toEqual([7, 9]);
  });

  it("reports depth to the visitor", () => {
    const depths: number[] = [];
    walk([node({ children: [node({ children: [node({})] })] })], (_n, depth) => depths.push(depth));
    expect(depths).toEqual([1, 2, 3]);
  });
});
