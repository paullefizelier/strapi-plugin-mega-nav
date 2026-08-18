import type { Core } from "@strapi/strapi";
import { NAVIGATION_UID } from "./i18n";
import { walk, type NavNode } from "./tree";

/**
 * Custom item fields are DATA, not code: the definitions live in the plugin
 * core store, are seeded once from the defaults below, and are read live on
 * every request. Changing a field in the admin takes effect immediately — no
 * config file, no restart, and no "DB config wins over the file" drift since
 * there is exactly one authority.
 */

export type FieldType = "string" | "text" | "boolean" | "select" | "media" | "url" | "number";

export interface FieldDef {
  /** Key in `node.fields`. Locked after creation. */
  name: string;
  type: FieldType;
  label: string;
  /** select only */
  options?: string[];
  /** Depths (1-based) where the field applies; absent = every level. */
  levels?: number[];
  /** Hidden from the editor but values are preserved. */
  disabled?: boolean;
  /**
   * Whether machine translation may rewrite this value. Absent falls back to
   * the type: prose is translated, everything identifying is not (see
   * `isTranslatable`).
   */
  translatable?: boolean;
}

/**
 * Prose gets translated; identifiers do not. A URL, a select key, an icon name
 * or a brand key must survive a translation pass untouched — rewriting them
 * silently breaks a link or a lookup, which is exactly the class of failure
 * nobody notices until the page is live.
 */
export function isTranslatable(def: FieldDef | undefined): boolean {
  if (!def || def.disabled) return false;
  if (def.translatable !== undefined) return def.translatable;
  return def.type === "string" || def.type === "text";
}

/**
 * Seed schema: the fields the reference front consumes. `link` is deliberately
 * NOT a field — the old plugin's free-link escape hatch is absorbed into the
 * typed link model at migration.
 */
export const DEFAULT_FIELDS: FieldDef[] = [
  {
    name: "presentation",
    type: "select",
    label: "Panel layout (level-1 item)",
    options: [
      "simple",
      "columns",
      "cards",
      "list",
      "featured",
      "bento",
      "split",
      "banner",
      "preview",
      "teams",
      "directory",
      "tabs",
      "brands",
    ],
    levels: [1],
  },
  { name: "description", type: "string", label: "Description / promo panel title" },
  // A lucide id, not prose — translating it would break the icon.
  { name: "icon", type: "string", label: "Icon (e.g. i-lucide-briefcase)", translatable: false },
  { name: "image", type: "media", label: "Image (promo panel or link visual)" },
  { name: "imagePosition", type: "select", label: "Promo image position", options: ["start", "end"] },
  { name: "ctaLabel", type: "string", label: "CTA — label" },
  { name: "ctaUrl", type: "url", label: "CTA — link" },
  { name: "tagline", type: "string", label: "Promo panel subtitle" },
  { name: "highlight", type: "boolean", label: "Highlighted column (columns)" },
  // A lookup key matched against an external source — never translated.
  { name: "offerBrand", type: "string", label: "Offers brand key (teams)", translatable: false },
  // A CSS colour, not prose — used to tint a brand tile.
  {
    name: "color",
    type: "string",
    label: "Accent colour (e.g. #a60000)",
    translatable: false,
  },
];

const FIELD_TYPES = new Set<FieldType>(["string", "text", "boolean", "select", "media", "url", "number"]);
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function validateFieldDefs(defs: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(defs)) return ["fields must be an array"];
  const seen = new Set<string>();
  defs.forEach((raw, i) => {
    const at = `fields[${i}]`;
    const def = (raw ?? {}) as Partial<FieldDef>;
    if (typeof def.name !== "string" || !NAME_RE.test(def.name)) {
      errors.push(`${at}: invalid name`);
    } else if (seen.has(def.name)) {
      errors.push(`${at}: duplicate name "${def.name}"`);
    } else {
      seen.add(def.name);
    }
    if (!FIELD_TYPES.has(def.type as FieldType)) errors.push(`${at}: invalid type "${String(def.type)}"`);
    if (typeof def.label !== "string" || !def.label.trim()) errors.push(`${at}: missing label`);
    if (def.type === "select" && (!Array.isArray(def.options) || !def.options.length)) {
      errors.push(`${at}: select needs options`);
    }
    if (def.levels !== undefined && (!Array.isArray(def.levels) || def.levels.some((l) => !Number.isInteger(l) || l < 1))) {
      errors.push(`${at}: levels must be positive integers`);
    }
    if (def.translatable !== undefined && typeof def.translatable !== "boolean") {
      errors.push(`${at}: translatable must be a boolean`);
    }
    if (def.disabled !== undefined && typeof def.disabled !== "boolean") {
      errors.push(`${at}: disabled must be a boolean`);
    }
  });
  return errors;
}

const store = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "mega-nav" });

export async function getFieldDefs(strapi: Core.Strapi): Promise<FieldDef[]> {
  const stored = (await store(strapi).get({ key: "fields" })) as FieldDef[] | null;
  return stored?.length ? stored : DEFAULT_FIELDS;
}

export async function setFieldDefs(strapi: Core.Strapi, defs: FieldDef[]): Promise<void> {
  const errors = validateFieldDefs(defs);
  if (errors.length) throw new Error(errors.join("; "));
  await store(strapi).set({ key: "fields", value: defs });
}

/** Seed once so the admin always edits a concrete list, never an implicit default. */
export async function seedFieldDefs(strapi: Core.Strapi): Promise<void> {
  const stored = (await store(strapi).get({ key: "fields" })) as FieldDef[] | null;
  if (!stored?.length) await store(strapi).set({ key: "fields", value: DEFAULT_FIELDS });
}

/**
 * "Delete and purge": drops the definition AND strips the key from every
 * navigation row (drafts and published) — the destructive alternative to
 * `disabled`, which keeps values. Rows are patched via the db layer: this is a
 * bulk data operation, not an editorial change, so no draft/publish dance.
 */
export async function purgeField(
  strapi: Core.Strapi,
  name: string,
): Promise<{ removedValues: number }> {
  const defs = await getFieldDefs(strapi);
  await store(strapi).set({ key: "fields", value: defs.filter((d) => d.name !== name) });

  const rows = (await strapi.db.query(NAVIGATION_UID).findMany({
    select: ["id", "items"],
  })) as { id: number; items?: NavNode[] }[];

  let removedValues = 0;
  for (const row of rows) {
    let touched = false;
    walk(row.items ?? [], (node) => {
      if (node.fields && name in node.fields) {
        delete node.fields[name];
        removedValues += 1;
        touched = true;
      }
    });
    if (touched) {
      await strapi.db.query(NAVIGATION_UID).update({ where: { id: row.id }, data: { items: row.items } });
    }
  }
  return { removedValues };
}
