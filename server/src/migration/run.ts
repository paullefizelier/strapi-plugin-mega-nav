import type { Core } from "@strapi/strapi";
import { getFieldDefs } from "../fields";
import { NAVIGATION_UID } from "../i18n";
import { getSources } from "../sources";
import { walk, type MediaRef, type NavNode } from "../tree";
import { existingFileIds, hasOldTables, readOldTables } from "./read";
import { normalizeAll, type NormalizedNavigation, type PendingInternal } from "./normalize";

/**
 * Orchestration around the pure normalizer. `scan` runs the ENTIRE pipeline —
 * reads, normalization, pending-link resolution, media verification — without
 * writing anything; `run` is scan + idempotent upsert. The report is the
 * product: nothing the migration guessed, dropped or failed to resolve is
 * silent.
 */

export interface MigrationOptions {
  /** Replace existing mega-nav navigations sharing a slug (default: skip + report). */
  overwrite?: boolean;
}

export interface NavigationReport {
  slug: string;
  name: string;
  action: "create" | "overwrite" | "skip";
  locales: Record<
    string,
    {
      items: number;
      links: { internal: number; external: number; path: number; none: number };
      reverseMatched: number;
      pathFallbacks: string[];
      unknownFieldKeys: string[];
      booleansCoerced: number;
      mediaRelinked: number;
      mediaMissing: number;
      unpaired: number;
      menuDetachedRoots: string[];
    }
  >;
}

export interface MigrationReport {
  mode: "scan" | "run";
  ok: boolean;
  reason?: string;
  navigations: NavigationReport[];
  morphDuplicatesDeduped: number;
  warnings: string[];
}

/** Resolve pending reverse-matches: one $in query per (uid, field, locale). */
async function resolvePending(
  strapi: Core.Strapi,
  navigations: NormalizedNavigation[],
): Promise<Map<PendingInternal, string | null>> {
  const buckets = new Map<string, { uid: string; field: string; locale?: string; values: Set<string> }>();
  for (const nav of navigations) {
    for (const pending of nav.pending) {
      const key = `${pending.uid}|${pending.field}|${pending.locale ?? ""}`;
      const bucket =
        buckets.get(key) ??
        buckets.set(key, { uid: pending.uid, field: pending.field, locale: pending.locale, values: new Set() }).get(key)!;
      bucket.values.add(pending.value);
    }
  }

  const found = new Map<string, string>(); // bucketKey|value → documentId
  for (const [key, bucket] of buckets) {
    try {
      const rows = (await strapi.documents(bucket.uid as never).findMany({
        fields: ["documentId", bucket.field],
        filters: { [bucket.field]: { $in: [...bucket.values] } },
        locale: bucket.locale,
        status: "draft",
      } as never)) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        found.set(`${key}|${String(row[bucket.field])}`, String(row.documentId));
      }
    } catch {
      // Unknown uid or unqueryable field: every pending in the bucket falls back.
    }
  }

  const resolution = new Map<PendingInternal, string | null>();
  for (const nav of navigations) {
    for (const pending of nav.pending) {
      const key = `${pending.uid}|${pending.field}|${pending.locale ?? ""}|${pending.value}`;
      resolution.set(pending, found.get(key) ?? null);
    }
  }
  return resolution;
}

/** Patch pending placeholders into internal links (or leave the path fallback). */
function applyPending(
  nav: NormalizedNavigation,
  resolution: Map<PendingInternal, string | null>,
): void {
  for (const pending of nav.pending) {
    const documentId = resolution.get(pending);
    const report = nav.reports[pending.locale ?? ""] ?? Object.values(nav.reports)[0];
    const tree = nav.locales[pending.locale ?? ""] ?? [];
    walk(tree, (node) => {
      if (node.id !== pending.nodeId) return;
      if (documentId) {
        node.link = {
          kind: "internal",
          uid: pending.uid,
          documentId,
          ...(pending.query ? { query: pending.query } : {}),
          ...(pending.hash ? { hash: pending.hash } : {}),
        };
        report.links.internal += 1;
      } else {
        report.links.path += 1;
        report.pathFallbacks.push(pending.rawPath);
      }
    });
  }
}

/** Verify decoded media against the files table; strip what no longer exists. */
async function verifyMedia(
  strapi: Core.Strapi,
  navigations: NormalizedNavigation[],
): Promise<Map<string, { relinked: number; missing: number }>> {
  const ids = new Set<number>();
  for (const nav of navigations) {
    for (const tree of Object.values(nav.locales)) {
      walk(tree, (node) => {
        for (const value of Object.values(node.fields ?? {})) {
          const media = (value as { media?: MediaRef })?.media;
          if (media?.id) ids.add(media.id);
        }
      });
    }
  }
  const existing = await existingFileIds(strapi, [...ids]);

  const stats = new Map<string, { relinked: number; missing: number }>();
  for (const nav of navigations) {
    for (const [locale, tree] of Object.entries(nav.locales)) {
      const stat = { relinked: 0, missing: 0 };
      walk(tree, (node) => {
        for (const [key, value] of Object.entries(node.fields ?? {})) {
          const media = (value as { media?: MediaRef })?.media;
          if (!media?.id) continue;
          if (existing.has(media.id)) stat.relinked += 1;
          else {
            delete node.fields[key];
            stat.missing += 1;
          }
        }
      });
      stats.set(`${nav.slug}|${locale}`, stat);
    }
  }
  return stats;
}

function toReport(
  nav: NormalizedNavigation,
  action: NavigationReport["action"],
  mediaStats: Map<string, { relinked: number; missing: number }>,
): NavigationReport {
  const locales: NavigationReport["locales"] = {};
  for (const [locale, report] of Object.entries(nav.reports)) {
    const media = mediaStats.get(`${nav.slug}|${locale}`) ?? { relinked: 0, missing: 0 };
    locales[locale] = {
      items: report.items,
      links: {
        internal: report.links.internal,
        external: report.links.external,
        path: report.links.path,
        none: report.links.none,
      },
      reverseMatched: report.links.pending,
      pathFallbacks: report.pathFallbacks,
      unknownFieldKeys: report.unknownFieldKeys,
      booleansCoerced: report.booleansCoerced,
      mediaRelinked: media.relinked,
      mediaMissing: media.missing,
      unpaired: report.unpaired,
      menuDetachedRoots: report.menuDetachedRoots,
    };
  }
  return { slug: nav.slug, name: nav.name, action, locales };
}

async function existingBySlug(
  strapi: Core.Strapi,
  slug: string,
): Promise<{ documentId: string } | null> {
  return (await strapi.documents(NAVIGATION_UID as never).findFirst({
    filters: { slug },
    status: "draft",
  } as never)) as unknown as { documentId: string } | null;
}

export async function migrate(
  strapi: Core.Strapi,
  mode: "scan" | "run",
  { overwrite = false }: MigrationOptions = {},
): Promise<MigrationReport> {
  if (!(await hasOldTables(strapi))) {
    return {
      mode,
      ok: false,
      reason: "strapi-plugin-navigation tables not found in this database",
      navigations: [],
      morphDuplicatesDeduped: 0,
      warnings: [],
    };
  }

  const { tables, warnings, morphDuplicatesDeduped } = await readOldTables(strapi);
  const sources = getSources(strapi);
  const fieldDefs = await getFieldDefs(strapi);
  const defaultLocale = ((await strapi
    .plugin("i18n")
    ?.service("locales")
    ?.getDefaultLocale?.()) ?? "en") as string;

  const navigations = normalizeAll(tables, sources, fieldDefs, { defaultLocale });
  const resolution = await resolvePending(strapi, navigations);
  for (const nav of navigations) applyPending(nav, resolution);
  const mediaStats = await verifyMedia(strapi, navigations);

  const report: MigrationReport = {
    mode,
    ok: true,
    navigations: [],
    morphDuplicatesDeduped,
    warnings,
  };

  for (const nav of navigations) {
    const existing = await existingBySlug(strapi, nav.slug);
    const action: NavigationReport["action"] = existing ? (overwrite ? "overwrite" : "skip") : "create";
    report.navigations.push(toReport(nav, action, mediaStats));
    if (mode === "scan" || action === "skip") continue;

    const locales = Object.entries(nav.locales);
    const [firstLocale, firstTree] = locales[0];

    let documentId = existing?.documentId;
    if (!documentId) {
      const created = (await strapi.documents(NAVIGATION_UID as never).create({
        data: { name: nav.name, slug: nav.slug, visible: nav.visible, items: firstTree } as never,
        locale: firstLocale,
      } as never)) as unknown as { documentId: string };
      documentId = created.documentId;
    } else {
      await strapi.documents(NAVIGATION_UID as never).update({
        documentId,
        locale: firstLocale,
        data: { name: nav.name, visible: nav.visible, items: firstTree } as never,
      } as never);
    }

    for (const [locale, tree] of locales.slice(1)) {
      await strapi.documents(NAVIGATION_UID as never).update({
        documentId,
        locale,
        data: { items: tree } as never,
      } as never);
    }

    // The old data was live — publish every migrated locale.
    for (const [locale] of locales) {
      await strapi.documents(NAVIGATION_UID as never).publish({ documentId, locale } as never);
    }
  }

  await strapi
    .store({ type: "plugin", name: "mega-nav" })
    .set({ key: "migration:lastRun", value: { at: new Date().toISOString(), ...report } });

  return report;
}
