import { describe, expect, it } from "vitest";
import { lintSubtree } from "./lint";
import type { LayoutSpec, NavNode } from "../types";

const node = (title: string, partial: Partial<NavNode> = {}): NavNode => ({
  id: `id-${title}`,
  title,
  link: { kind: "none" },
  fields: {},
  children: [],
  ...partial,
});

const columns: LayoutSpec = {
  key: "columns",
  label: "Columns",
  recipe: "",
  levels: [
    { role: "root", label: "Menu", childrenAllowed: true, min: 1, fields: [] },
    { role: "group", label: "Group", childrenAllowed: true, min: 1, fields: [] },
    { role: "link", label: "Link", childrenAllowed: false, linkExpected: true, fields: [] },
  ],
  preview: { template: "linksPromo", params: {} },
};

const bento: LayoutSpec = {
  key: "bento",
  label: "Bento",
  recipe: "",
  levels: [
    { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
    {
      role: "link",
      label: "Tile",
      childrenAllowed: false,
      min: 3,
      linkExpected: true,
      fields: [{ field: "image", zone: "tile.image", required: true }],
    },
  ],
  preview: { template: "mosaic", params: {} },
};

describe("lintSubtree", () => {
  it("mirrors the front's degradation: a grouped layout on a flat tree", () => {
    const flat = node("Root", { children: [node("A"), node("B")] });
    const issues = lintSubtree(flat, columns);
    expect(issues.some((i) => i.code === "will-degrade" && i.severity === "degrade")).toBe(true);

    const grouped = node("Root", { children: [node("G", { children: [node("L")] })] });
    expect(lintSubtree(grouped, columns).some((i) => i.code === "will-degrade")).toBe(false);
  });

  it("flags a wrapper where the level expects a link", () => {
    const tree = node("Root", {
      children: [node("G", { children: [node("Wrapper link")] })],
    });
    const issues = lintSubtree(tree, columns);
    expect(issues.some((i) => i.code === "link-expected" && i.nodeTitle === "Wrapper link")).toBe(true);
  });

  it("checks min children and required fields (bento wants 3 tiles with images)", () => {
    const tree = node("Root", { children: [node("T1"), node("T2")] });
    const issues = lintSubtree(tree, bento);
    expect(issues.some((i) => i.code === "too-few-children")).toBe(true);
    expect(issues.filter((i) => i.code === "missing-required-field")).toHaveLength(2);
  });

  it("flags items deeper than the layout renders", () => {
    const tree = node("Root", {
      children: [
        node("G", {
          children: [node("L", { children: [node("Too deep")] })],
        }),
      ],
    });
    const issues = lintSubtree(tree, columns);
    expect(issues.some((i) => i.code === "too-deep" && i.nodeTitle === "Too deep")).toBe(true);
  });

  it("reports broken internal refs even without a layout", () => {
    const tree = node("Root", {
      children: [
        node("Gone", { link: { kind: "internal", uid: "api::page.page", documentId: "x" } }),
      ],
    });
    const issues = lintSubtree(tree, null, { brokenRefs: new Set(["api::page.page:x"]) });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("broken-ref");
  });
});
