import type { Core } from "@strapi/strapi";
import { collectRefs, type NavNode } from "./tree";
import { sourceFields, type SourceConfig } from "./sources";

/**
 * Render-time batch resolution: ONE findMany per referenced content type plus
 * one media query, whatever the item count — the whole menu resolves in ~2–4
 * queries. Only PUBLISHED targets resolve (a menu never links to a draft);
 * what happens to a broken link is the serializer's decision.
 */

export interface MediaFile {
  id: number;
  documentId?: string;
  url: string;
  alternativeText?: string | null;
  width?: number | null;
  height?: number | null;
  formats?: Record<string, { url: string; width?: number; height?: number }> | null;
}

export interface ResolvedMaps {
  /** uid → documentId → published entry (with related populate when configured). */
  entries: Record<string, Record<string, Record<string, unknown>>>;
  /** file id → upload file. */
  media: Record<number, MediaFile>;
}

export async function resolveTree(
  strapi: Core.Strapi,
  nodes: NavNode[],
  sources: Record<string, SourceConfig>,
  locale?: string,
): Promise<ResolvedMaps> {
  const refs = collectRefs(nodes);
  const entries: ResolvedMaps["entries"] = {};

  for (const [uid, ids] of Object.entries(refs.internal)) {
    const source = sources[uid];
    if (!source) continue; // unknown source: the serializer degrades the item
    const populate = source.related?.populate?.length ? source.related.populate : undefined;
    const rows = (await strapi.documents(uid as never).findMany({
      fields: sourceFields(source),
      filters: { documentId: { $in: [...ids] } },
      locale,
      status: "published",
      ...(populate ? { populate } : {}),
    } as never)) as unknown as Record<string, unknown>[];
    entries[uid] = Object.fromEntries(rows.map((row) => [String(row.documentId), row]));
  }

  const media: ResolvedMaps["media"] = {};
  if (refs.mediaIds.size) {
    // db layer: upload files are queried by numeric id, no draft dimension.
    const rows = (await strapi.db
      .query("plugin::upload.file")
      .findMany({ where: { id: { $in: [...refs.mediaIds] } } })) as MediaFile[];
    for (const row of rows) media[row.id] = row;
  }

  return { entries, media };
}
