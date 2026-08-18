import type { FieldDef } from "./types";

/**
 * The admin's single copy of the translatability rule.
 *
 * It necessarily mirrors `server/src/fields.ts` — admin and server are separate
 * bundles and cannot import from each other — so it lives here, alone and
 * tested, rather than inline in a screen where the duplication would rot
 * unnoticed. Change one, change both: the test pins the rule.
 */
export function isTranslatable(def: FieldDef): boolean {
  if (def.disabled) return false;
  if (def.translatable !== undefined) return def.translatable;
  return def.type === "string" || def.type === "text";
}
