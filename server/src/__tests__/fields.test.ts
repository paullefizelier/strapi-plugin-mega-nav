import { describe, expect, it, vi } from "vitest";
import type { Core } from "@strapi/strapi";
import {
  DEFAULT_FIELDS,
  getFieldDefs,
  seedFieldDefs,
  setFieldDefs,
  validateFieldDefs,
} from "../fields";

function makeStrapi(stored: unknown = null) {
  const state = { value: stored };
  const set = vi.fn(async ({ value }: { value: unknown }) => {
    state.value = value;
  });
  const strapi = {
    store: () => ({
      get: async () => state.value,
      set,
    }),
  } as unknown as Core.Strapi;
  return { strapi, state, set };
}

describe("validateFieldDefs", () => {
  it("accepts the defaults", () => {
    expect(validateFieldDefs(DEFAULT_FIELDS)).toEqual([]);
  });

  it("flags bad names, duplicate names, bad types and optionless selects", () => {
    expect(validateFieldDefs([{ name: "2bad", type: "string", label: "x" }]).join()).toContain("invalid name");
    expect(
      validateFieldDefs([
        { name: "dup", type: "string", label: "x" },
        { name: "dup", type: "string", label: "y" },
      ]).join(),
    ).toContain("duplicate name");
    expect(validateFieldDefs([{ name: "a", type: "banana", label: "x" }]).join()).toContain("invalid type");
    expect(validateFieldDefs([{ name: "a", type: "select", label: "x" }]).join()).toContain("needs options");
    expect(validateFieldDefs([{ name: "a", type: "string", label: "x", levels: [0] }]).join()).toContain(
      "positive integers",
    );
  });
});

describe("store IO", () => {
  it("falls back to the defaults when nothing is stored", async () => {
    const { strapi } = makeStrapi(null);
    expect(await getFieldDefs(strapi)).toEqual(DEFAULT_FIELDS);
  });

  it("returns the stored schema once one exists", async () => {
    const custom = [{ name: "badge", type: "string" as const, label: "Badge" }];
    const { strapi } = makeStrapi(custom);
    expect(await getFieldDefs(strapi)).toEqual(custom);
  });

  it("seeds once and never overwrites an existing schema", async () => {
    const empty = makeStrapi(null);
    await seedFieldDefs(empty.strapi);
    expect(empty.state.value).toEqual(DEFAULT_FIELDS);

    const custom = makeStrapi([{ name: "badge", type: "string", label: "Badge" }]);
    await seedFieldDefs(custom.strapi);
    expect(custom.set).not.toHaveBeenCalled();
  });

  it("refuses to store an invalid schema", async () => {
    const { strapi } = makeStrapi(null);
    await expect(
      setFieldDefs(strapi, [{ name: "a", type: "select", label: "x" } as never]),
    ).rejects.toThrow("needs options");
  });
});
