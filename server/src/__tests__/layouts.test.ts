import { describe, expect, it, vi } from "vitest";
import type { Core } from "@strapi/strapi";
import {
  DEFAULT_LAYOUTS,
  getLayoutSpecs,
  needsGroups,
  seedLayoutSpecs,
  setLayoutSpecs,
  validateLayoutSpecs,
  type LayoutSpec,
} from "../layouts";

function makeStrapi(stored: unknown = null) {
  const state = { value: stored };
  const set = vi.fn(async ({ value }: { value: unknown }) => {
    state.value = value;
  });
  const strapi = {
    store: () => ({ get: async () => state.value, set }),
  } as unknown as Core.Strapi;
  return { strapi, state, set };
}

describe("DEFAULT_LAYOUTS", () => {
  it("ships the reference layouts, each valid", () => {
    expect(DEFAULT_LAYOUTS.map((l) => l.key).sort()).toEqual(
      [
        "banner", "bento", "brands", "cards", "columns", "directory", "featured",
        "list", "preview", "simple", "split", "tabs", "teams",
      ].sort(),
    );
    expect(validateLayoutSpecs(DEFAULT_LAYOUTS)).toEqual([]);
  });

  it("offers every layout in the presentation field's options", async () => {
    const { DEFAULT_FIELDS } = await import("../fields");
    const options = DEFAULT_FIELDS.find((f) => f.name === "presentation")?.options ?? [];
    expect([...options].sort()).toEqual(DEFAULT_LAYOUTS.map((l) => l.key).sort());
  });

  it("only names preview templates the admin can render", () => {
    const known = ["linkList", "rowList", "cardGrid", "mosaic", "linksPromo", "tabsDetail"];
    for (const spec of DEFAULT_LAYOUTS) {
      expect(known).toContain(spec.preview.template);
    }
  });

  it("only references fields that exist in the default schema", async () => {
    const { DEFAULT_FIELDS } = await import("../fields");
    const known = new Set(DEFAULT_FIELDS.map((f) => f.name));
    const unknown = DEFAULT_LAYOUTS.flatMap((l) =>
      l.levels.flatMap((level) => level.fields.map((u) => u.field)),
    ).filter((name) => !known.has(name));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("gives every grouped layout a link level below its groups", () => {
    for (const spec of DEFAULT_LAYOUTS.filter(needsGroups)) {
      expect(spec.levels.length).toBeGreaterThanOrEqual(3);
      expect(spec.levels[spec.levels.length - 1]?.role).toBe("link");
    }
  });
});

describe("needsGroups", () => {
  it("is derived from the declared levels, not a hardcoded list", () => {
    const grouped = DEFAULT_LAYOUTS.filter(needsGroups).map((l) => l.key);
    expect(grouped.sort()).toEqual(["banner", "columns", "directory", "split", "tabs", "teams"].sort());
    // A layout added in the admin is covered without touching the code.
    expect(
      needsGroups({
        key: "custom",
        label: "Custom",
        recipe: "",
        levels: [
          { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
          { role: "group", label: "Group", childrenAllowed: true, fields: [] },
          { role: "link", label: "Link", childrenAllowed: false, fields: [] },
        ],
        preview: { template: "linksPromo", params: {} },
      }),
    ).toBe(true);
  });
});

describe("validateLayoutSpecs", () => {
  const valid: LayoutSpec = {
    key: "x",
    label: "X",
    recipe: "",
    levels: [{ role: "root", label: "Menu", childrenAllowed: true, fields: [] }],
    preview: { template: "linkList", params: {} },
  };

  it("rejects a non-array", () => {
    expect(validateLayoutSpecs({})).toEqual(["layouts must be an array"]);
  });

  it("flags missing key, missing label, duplicate key", () => {
    expect(validateLayoutSpecs([{ ...valid, key: "" }]).join()).toContain("missing key");
    expect(validateLayoutSpecs([{ ...valid, label: "" }]).join()).toContain("missing label");
    expect(validateLayoutSpecs([valid, valid]).join()).toContain("duplicate key");
  });

  it("requires at least one level, with a role and a fields array", () => {
    expect(validateLayoutSpecs([{ ...valid, levels: [] }]).join()).toContain("at least one level");
    expect(
      validateLayoutSpecs([{ ...valid, levels: [{ label: "x", childrenAllowed: true, fields: [] }] }]).join(),
    ).toContain("missing role");
    expect(
      validateLayoutSpecs([{ ...valid, levels: [{ role: "root", label: "x", childrenAllowed: true }] }]).join(),
    ).toContain("fields must be an array");
  });

  it("requires a preview template", () => {
    expect(validateLayoutSpecs([{ ...valid, preview: undefined }]).join()).toContain("preview.template");
  });
});

describe("store IO", () => {
  it("falls back to the defaults when nothing is stored", async () => {
    const { strapi } = makeStrapi(null);
    expect(await getLayoutSpecs(strapi)).toEqual(DEFAULT_LAYOUTS);
  });

  it("seeds once and never overwrites a customised set", async () => {
    const empty = makeStrapi(null);
    await seedLayoutSpecs(empty.strapi);
    expect(empty.state.value).toEqual(DEFAULT_LAYOUTS);

    const custom = makeStrapi([{ key: "own", label: "Own", recipe: "", levels: [{ role: "root", label: "M", childrenAllowed: true, fields: [] }], preview: { template: "linkList", params: {} } }]);
    await seedLayoutSpecs(custom.strapi);
    expect(custom.set).not.toHaveBeenCalled();
  });

  it("refuses to store an invalid set", async () => {
    const { strapi, set } = makeStrapi(null);
    await expect(setLayoutSpecs(strapi, [{ key: "a" } as never])).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});
