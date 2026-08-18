import { describe, expect, it } from "vitest";
import { isTranslatable } from "./fields";
import type { FieldDef } from "./types";

const def = (partial: Partial<FieldDef>): FieldDef => ({
  name: "x",
  type: "string",
  label: "X",
  ...partial,
});

/**
 * Pins the rule so the admin copy cannot drift from server/src/fields.ts
 * unnoticed. The cases mirror that file's tests one for one.
 */
describe("isTranslatable (admin mirror)", () => {
  it("translates prose by default", () => {
    expect(isTranslatable(def({ type: "string" }))).toBe(true);
    expect(isTranslatable(def({ type: "text" }))).toBe(true);
  });

  it("leaves identifiers alone by default", () => {
    for (const type of ["url", "select", "media", "boolean", "number"] as const) {
      expect(isTranslatable(def({ type }))).toBe(false);
    }
  });

  it("honours an explicit flag either way", () => {
    expect(isTranslatable(def({ type: "url", translatable: true }))).toBe(true);
    expect(isTranslatable(def({ type: "string", translatable: false }))).toBe(false);
  });

  it("never translates a disabled field, whatever the flag says", () => {
    expect(isTranslatable(def({ type: "string", disabled: true }))).toBe(false);
    expect(isTranslatable(def({ type: "string", translatable: true, disabled: true }))).toBe(false);
  });
});
