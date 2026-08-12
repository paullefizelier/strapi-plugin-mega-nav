import type { Core } from "@strapi/strapi";

/**
 * Raw readers over strapi-plugin-navigation's tables, via the db connection —
 * they work even after the old plugin is uninstalled, since Strapi never
 * drops tables. No transformation here: normalize.ts is the pure, tested part.
 */

export interface OldNavigationRow {
  id: number;
  document_id: string;
  name: string;
  slug: string;
  visible: number | boolean;
  locale: string | null;
  published_at: string | null;
}

export interface OldItemRow {
  id: number;
  title: string;
  type: "INTERNAL" | "EXTERNAL" | "WRAPPER" | string;
  path: string | null;
  external_path: string | null;
  menu_attached: number | boolean;
  order: number;
  additional_fields: unknown;
}

export interface OldTables {
  navigations: OldNavigationRow[];
  items: OldItemRow[];
  /** item id → navigation id */
  masters: { navigation_item_id: number; navigation_id: number }[];
  /** item id → PARENT item id (inv_navigation_item_id is the parent) */
  parents: { navigation_item_id: number; inv_navigation_item_id: number }[];
  /** item id → deduped related targets */
  related: Record<number, { uid: string; documentId: string }[]>;
}

const knexOf = (strapi: Core.Strapi) =>
  (strapi.db as unknown as { connection: import("knex").Knex }).connection;

export async function hasOldTables(strapi: Core.Strapi): Promise<boolean> {
  const knex = knexOf(strapi);
  return (
    (await knex.schema.hasTable("navigations")) && (await knex.schema.hasTable("navigations_items"))
  );
}

export async function readOldTables(
  strapi: Core.Strapi,
): Promise<{ tables: OldTables; warnings: string[]; morphDuplicatesDeduped: number }> {
  const knex = knexOf(strapi);
  const warnings: string[] = [];

  const navigations = (await knex("navigations").select(
    "id",
    "document_id",
    "name",
    "slug",
    "visible",
    "locale",
    "published_at",
  )) as OldNavigationRow[];

  const items = (await knex("navigations_items").select(
    "id",
    "title",
    "type",
    "path",
    "external_path",
    "menu_attached",
    "order",
    "additional_fields",
  )) as OldItemRow[];

  const masters = await knex("navigations_items_master_lnk").select(
    "navigation_item_id",
    "navigation_id",
  );
  const parents = await knex("navigations_items_parent_lnk").select(
    "navigation_item_id",
    "inv_navigation_item_id",
  );

  const morphs = (await knex("navigations_items_related_mph").select(
    "navigation_item_id",
    "related_id",
    "related_type",
  )) as { navigation_item_id: number; related_id: number; related_type: string }[];

  // Morph targets: resolve each related_id to its documentId, then DEDUPE —
  // the old table holds one row for the draft and one for the published row of
  // the same document.
  const related: OldTables["related"] = {};
  let deduped = 0;
  const byType = new Map<string, Set<number>>();
  for (const morph of morphs) {
    (byType.get(morph.related_type) ?? byType.set(morph.related_type, new Set()).get(morph.related_type)!).add(
      morph.related_id,
    );
  }

  const idToDocument = new Map<string, string>(); // `${type}:${id}` → documentId
  for (const [uid, ids] of byType) {
    const meta = (strapi.db as unknown as { metadata: Map<string, { tableName: string }> }).metadata.get(
      uid,
    );
    if (!meta?.tableName) {
      warnings.push(`related type "${uid}" is not a known content type — its links are skipped`);
      continue;
    }
    const rows = (await knex(meta.tableName)
      .select("id", "document_id")
      .whereIn("id", [...ids])) as { id: number; document_id: string }[];
    for (const row of rows) idToDocument.set(`${uid}:${row.id}`, row.document_id);
  }

  for (const morph of morphs) {
    const documentId = idToDocument.get(`${morph.related_type}:${morph.related_id}`);
    if (!documentId) continue;
    const list = (related[morph.navigation_item_id] ??= []);
    if (list.some((r) => r.uid === morph.related_type && r.documentId === documentId)) {
      deduped += 1;
      continue;
    }
    list.push({ uid: morph.related_type, documentId });
  }

  return {
    tables: { navigations, items, masters, parents, related },
    warnings,
    morphDuplicatesDeduped: deduped,
  };
}

/** Upload files that actually exist, among the given ids. */
export async function existingFileIds(strapi: Core.Strapi, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const knex = knexOf(strapi);
  const rows = (await knex("files").select("id").whereIn("id", ids)) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}
