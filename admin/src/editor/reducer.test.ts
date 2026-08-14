import { describe, expect, it } from "vitest";
import { normalizeForSave } from "./reducer";
import type { NavNode } from "../types";

const node = (title: string, partial: Partial<NavNode> = {}): NavNode => ({
  id: `id-${title}`,
  title,
  link: { kind: "none" },
  fields: {},
  children: [],
  ...partial,
});

describe("normalizeForSave", () => {
  it("turns an internal link with no entry picked into a wrapper", () => {
    const tree = [node("Draft", { link: { kind: "internal", uid: "api::page.page", documentId: "" } })];
    expect(normalizeForSave(tree)[0].link).toEqual({ kind: "none" });
  });

  it("keeps a complete internal link untouched, query included", () => {
    const link = {
      kind: "internal" as const,
      uid: "api::page.page",
      documentId: "abc",
      query: "family=Manutention",
    };
    expect(normalizeForSave([node("Jobs", { link })])[0].link).toEqual(link);
  });

  it("leaves the other link kinds alone", () => {
    const tree = [
      node("Ext", { link: { kind: "external", url: "https://example.com" } }),
      node("Path", { link: { kind: "path", path: "/jobs" } }),
      node("Wrapper"),
    ];
    expect(normalizeForSave(tree).map((n) => n.link.kind)).toEqual(["external", "path", "none"]);
  });

  it("normalizes at any depth without touching the rest of the node", () => {
    const tree = [
      node("Root", {
        fields: { presentation: "columns" },
        children: [
          node("Group", {
            children: [node("Incomplete", { link: { kind: "internal", uid: "api::page.page", documentId: "" } })],
          }),
        ],
      }),
    ];
    const out = normalizeForSave(tree);
    expect(out[0].fields).toEqual({ presentation: "columns" });
    expect(out[0].children[0].children[0].link).toEqual({ kind: "none" });
  });
});
