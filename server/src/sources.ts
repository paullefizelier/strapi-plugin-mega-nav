import type { Core } from "@strapi/strapi";
import { patternTokens, renderPattern } from "./links";

/**
 * A source is a content type whose entries can be navigation targets:
 * how to name them (titleField) and how to build their URL (pattern, or a
 * pathField for types that store their own path).
 *
 * Sources live in the HOST's config/plugins.ts — they are bound to content
 * types, which themselves only change with a code deploy, so restart-on-change
 * is acceptable here (unlike item fields, which are store-backed data).
 */
export interface SourceConfig {
  uid: string;
  titleField: string;
  /** URL pattern, tokens read the entry: "/articles/{slug}". */
  pattern?: string;
  /** Alternative to pattern: a field holding the full path. */
  pathField?: string;
  /** Extra data exposed under `related` in the render (scalar fields + media populate). */
  related?: { fields?: string[]; populate?: string[] };
}

export function getSources(strapi: Core.Strapi): SourceConfig[] {
  const raw = strapi.plugin("mega-nav").config("sources", []) as SourceConfig[];
  return (Array.isArray(raw) ? raw : []).filter(
    (s) => s && typeof s.uid === "string" && typeof s.titleField === "string",
  );
}

export function sourceByUid(strapi: Core.Strapi): Record<string, SourceConfig> {
  return Object.fromEntries(getSources(strapi).map((s) => [s.uid, s]));
}

/** Fields to fetch for a source: title + pattern tokens + pathField + related scalars. */
export function sourceFields(source: SourceConfig): string[] {
  const fields = new Set<string>([source.titleField]);
  if (source.pattern) for (const token of patternTokens(source.pattern)) fields.add(token);
  if (source.pathField) fields.add(source.pathField);
  for (const f of source.related?.fields ?? []) fields.add(f);
  return [...fields];
}

/** The entry's URL under this source, or null when it can't be built. */
export function entryHref(
  source: SourceConfig,
  entry: Record<string, unknown>,
  locale?: string,
): string | null {
  if (source.pathField) {
    const path = entry[source.pathField];
    return typeof path === "string" && path.startsWith("/") ? path : null;
  }
  if (source.pattern) return renderPattern(source.pattern, entry, locale);
  return null;
}

export interface EntryHit {
  documentId: string;
  title: string;
  href: string | null;
  published: boolean;
}

/**
 * Autocomplete search for the editor's link picker. Searches the draft pool
 * (every document has a draft in v5), then marks which ones are published.
 */
export async function searchEntries(
  strapi: Core.Strapi,
  source: SourceConfig,
  { q, locale, limit = 20 }: { q?: string; locale?: string; limit?: number },
): Promise<EntryHit[]> {
  const docs = (await strapi.documents(source.uid as never).findMany({
    fields: sourceFields(source),
    filters: q ? { [source.titleField]: { $containsi: q } } : undefined,
    locale,
    status: "draft",
    limit,
    sort: `${source.titleField}:asc`,
  } as never)) as unknown as Record<string, unknown>[];

  const published = new Set(
    (
      (await strapi.documents(source.uid as never).findMany({
        fields: ["documentId"],
        filters: { documentId: { $in: docs.map((d) => d.documentId) } },
        locale,
        status: "published",
      } as never)) as unknown as { documentId: string }[]
    ).map((d) => d.documentId),
  );

  return docs.map((entry) => ({
    documentId: String(entry.documentId),
    title: String(entry[source.titleField] ?? entry.documentId),
    href: entryHref(source, entry, locale),
    published: published.has(String(entry.documentId)),
  }));
}

export interface ResolvedRef {
  uid: string;
  documentId: string;
  title?: string;
  href?: string | null;
  published?: boolean;
  missing: boolean;
}

/**
 * Batch resolution for the editor: every internal ref of a tree in one call,
 * so the admin can show titles, current paths and broken-ref badges.
 */
export async function resolveRefs(
  strapi: Core.Strapi,
  refs: { uid: string; documentId: string }[],
  locale?: string,
): Promise<ResolvedRef[]> {
  const byUid = new Map<string, Set<string>>();
  for (const ref of refs) {
    if (!ref?.uid || !ref?.documentId) continue;
    (byUid.get(ref.uid) ?? byUid.set(ref.uid, new Set()).get(ref.uid)!).add(ref.documentId);
  }
  const sources = sourceByUid(strapi);
  const out: ResolvedRef[] = [];

  for (const [uid, ids] of byUid) {
    const source = sources[uid];
    if (!source) {
      for (const documentId of ids) out.push({ uid, documentId, missing: true });
      continue;
    }
    const fetch = async (status: "draft" | "published") =>
      (await strapi.documents(uid as never).findMany({
        fields: sourceFields(source),
        filters: { documentId: { $in: [...ids] } },
        locale,
        status,
      } as never)) as unknown as Record<string, unknown>[];

    const drafts = await fetch("draft");
    const publishedIds = new Set((await fetch("published")).map((d) => String(d.documentId)));

    const found = new Map(drafts.map((d) => [String(d.documentId), d]));
    for (const documentId of ids) {
      const entry = found.get(documentId);
      out.push(
        entry
          ? {
              uid,
              documentId,
              title: String(entry[source.titleField] ?? documentId),
              href: entryHref(source, entry, locale),
              published: publishedIds.has(documentId),
              missing: false,
            }
          : { uid, documentId, missing: true },
      );
    }
  }
  return out;
}
