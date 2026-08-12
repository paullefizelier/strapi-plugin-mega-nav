import { reverseMatch } from "../links";
import type { FieldDef } from "../fields";
import { newNodeId, type FieldValue, type NavLink, type NavNode } from "../tree";
import type { OldItemRow, OldNavigationRow, OldTables } from "./read";

/**
 * Pure transforms from the old plugin's rows to the new tree model. No IO:
 * reverse-matched internal links come out as `pending` placeholders that
 * run.ts resolves against the database, and media are decoded here but
 * verified there. Everything dropped or guessed lands in the report — nothing
 * is silently discarded.
 */

export interface PendingInternal {
  /** Node whose link awaits entry lookup. */
  nodeId: string;
  /** Locale of the tree the node lives in — ids are shared across locales, lookups are not. */
  locale?: string;
  uid: string;
  /** Single-token match: entry field → expected value. */
  field: string;
  value: string;
  query?: string;
  hash?: string;
  /** Where to fall back when the lookup finds nothing. */
  rawPath: string;
}

export interface LocaleReport {
  items: number;
  links: { internal: number; external: number; path: number; none: number; pending: number };
  pathFallbacks: string[];
  unknownFieldKeys: string[];
  booleansCoerced: number;
  mediaDecoded: number;
  mediaUnreadable: number;
  /** Items with no positional counterpart in the reference locale. */
  unpaired: number;
  menuDetachedRoots: string[];
}

export interface NormalizedNavigation {
  oldDocumentId: string;
  name: string;
  slug: string;
  visible: boolean;
  /** locale → tree (node ids paired across locales by position). */
  locales: Record<string, NavNode[]>;
  pending: PendingInternal[];
  reports: Record<string, LocaleReport>;
}

interface SourcePattern {
  uid: string;
  pattern?: string;
}

const emptyReport = (): LocaleReport => ({
  items: 0,
  links: { internal: 0, external: 0, path: 0, none: 0, pending: 0 },
  pathFallbacks: [],
  unknownFieldKeys: [],
  booleansCoerced: 0,
  mediaDecoded: 0,
  mediaUnreadable: 0,
  unpaired: 0,
  menuDetachedRoots: [],
});

const isJunkPath = (path: string | null | undefined): boolean => {
  if (!path) return true;
  const trimmed = path.trim();
  return !trimmed || trimmed === "null" || trimmed === "/null" || trimmed === "/";
};

/**
 * Link normalization — kills the old workarounds, in the old front's priority
 * order (the `link` additional field overrode everything there):
 *  1. `additionalFields.link`
 *  2. INTERNAL + related morph
 *  3. EXTERNAL path (absolute → external; relative → reverse-match)
 *  4. everything else → none (wrapper)
 */
function normalizeLink(
  item: OldItemRow,
  rawFields: Record<string, unknown>,
  relatedRefs: { uid: string; documentId: string }[],
  sources: SourcePattern[],
  nodeId: string,
  report: LocaleReport,
  pending: PendingInternal[],
): NavLink {
  const relativeToLink = (raw: string): NavLink => {
    const match = reverseMatch(raw, sources);
    const tokens = match ? Object.entries(match.where) : [];
    if (match && tokens.length === 1) {
      // Await entry lookup — run.ts turns it into internal or path.
      pending.push({
        nodeId,
        uid: match.uid,
        field: tokens[0][0],
        value: tokens[0][1],
        query: match.query,
        hash: match.hash,
        rawPath: raw,
      });
      report.links.pending += 1;
      return { kind: "path", path: raw }; // placeholder, patched by run.ts
    }
    report.links.path += 1;
    report.pathFallbacks.push(raw);
    return { kind: "path", path: raw };
  };

  const legacyLink = typeof rawFields.link === "string" ? rawFields.link.trim() : "";
  if (legacyLink) {
    if (/^https?:\/\//i.test(legacyLink)) {
      report.links.external += 1;
      return { kind: "external", url: legacyLink };
    }
    if (legacyLink.startsWith("/")) return relativeToLink(legacyLink);
  }

  if (item.type === "INTERNAL" && relatedRefs.length) {
    report.links.internal += 1;
    return { kind: "internal", uid: relatedRefs[0].uid, documentId: relatedRefs[0].documentId };
  }

  const external = (item.external_path ?? "").trim();
  if (item.type === "EXTERNAL" && external) {
    if (/^https?:\/\//i.test(external)) {
      report.links.external += 1;
      return { kind: "external", url: external };
    }
    if (external.startsWith("/")) return relativeToLink(external);
  }

  // INTERNAL with a hand-typed path and no morph — keep the path if sane.
  if (item.type === "INTERNAL" && !isJunkPath(item.path)) {
    const path = item.path!.startsWith("/") ? item.path! : `/${item.path}`;
    return relativeToLink(path);
  }

  report.links.none += 1;
  return { kind: "none" };
}

/** Decode the old `additional_fields` string bag into typed values. */
function decodeFields(
  raw: unknown,
  fieldDefs: FieldDef[],
  report: LocaleReport,
): Record<string, FieldValue> {
  let bag: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      bag = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else if (raw && typeof raw === "object") {
    bag = raw as Record<string, unknown>;
  }

  const defsByName = new Map(fieldDefs.map((d) => [d.name, d]));
  const out: Record<string, FieldValue> = {};

  for (const [key, value] of Object.entries(bag)) {
    if (key === "link") continue; // absorbed into the typed link model
    if (value === null || value === undefined || value === "") continue;
    const def = defsByName.get(key);

    if (!def) {
      // Legacy keys (megaKey…) are preserved verbatim AND reported — the old
      // plugin silently dropped them at render time.
      if (!report.unknownFieldKeys.includes(key)) report.unknownFieldKeys.push(key);
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
      }
      continue;
    }

    if (def.type === "boolean") {
      if (typeof value === "boolean") {
        out[key] = value;
      } else if (value === "true" || value === "false") {
        out[key] = value === "true";
        report.booleansCoerced += 1;
      }
      continue;
    }

    if (def.type === "media") {
      // The old plugin stringified the ENTIRE media object into the JSON bag.
      let media: Record<string, unknown> | null = null;
      if (typeof value === "string") {
        try {
          media = JSON.parse(value) as Record<string, unknown>;
        } catch {
          media = null;
        }
      } else if (value && typeof value === "object") {
        media = value as Record<string, unknown>;
      }
      if (media && typeof media.id === "number") {
        out[key] = {
          media: {
            id: media.id,
            documentId: String(media.documentId ?? ""),
            url: typeof media.url === "string" ? media.url : undefined,
            alternativeText:
              typeof media.alternativeText === "string" ? media.alternativeText : undefined,
          },
        };
        report.mediaDecoded += 1;
      } else {
        report.mediaUnreadable += 1;
      }
      continue;
    }

    if (def.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) out[key] = n;
      continue;
    }

    if (typeof value === "string") out[key] = value;
  }

  return out;
}

interface OldTreeNode {
  item: OldItemRow;
  children: OldTreeNode[];
}

/** Rebuild the per-navigation tree from the master + parent link tables. */
function buildOldTree(
  navigationId: number,
  tables: OldTables,
): OldTreeNode[] {
  const itemIds = new Set(
    tables.masters.filter((m) => m.navigation_id === navigationId).map((m) => m.navigation_item_id),
  );
  const items = tables.items.filter((i) => itemIds.has(i.id));
  const parentOf = new Map<number, number>();
  for (const link of tables.parents) {
    if (itemIds.has(link.navigation_item_id) && itemIds.has(link.inv_navigation_item_id)) {
      parentOf.set(link.navigation_item_id, link.inv_navigation_item_id);
    }
  }

  const nodes = new Map<number, OldTreeNode>(items.map((i) => [i.id, { item: i, children: [] }]));
  const roots: OldTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = parentOf.get(node.item.id);
    const parent = parentId !== undefined ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: OldTreeNode[]): void => {
    list.sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0));
    for (const node of list) sortRec(node.children);
  };
  sortRec(roots);
  return roots;
}

/**
 * Node ids paired across locales BY TREE POSITION — the old plugin's locale
 * trees are fully independent rows with no cross-link, but real data mirrors
 * the structure. A position that only exists in a non-reference locale keeps
 * its own id and is counted as unpaired.
 */
function convertTree(
  oldNodes: OldTreeNode[],
  reference: NavNode[] | null,
  tables: OldTables,
  sources: SourcePattern[],
  fieldDefs: FieldDef[],
  report: LocaleReport,
  pending: PendingInternal[],
  depth = 1,
): NavNode[] {
  return oldNodes.map((oldNode, index) => {
    const ref = reference?.[index];
    if (reference && !ref) report.unpaired += 1;
    const id = ref?.id ?? newNodeId();
    report.items += 1;

    if (depth === 1 && !oldNode.item.menu_attached) {
      // The old front never filtered on menuAttached, so mapping it to
      // `hidden` would CHANGE the render — reported for review instead.
      report.menuDetachedRoots.push(oldNode.item.title);
    }

    const fields = decodeFields(oldNode.item.additional_fields, fieldDefs, report);
    const link = normalizeLink(
      oldNode.item,
      typeof oldNode.item.additional_fields === "string"
        ? safeParse(oldNode.item.additional_fields)
        : ((oldNode.item.additional_fields ?? {}) as Record<string, unknown>),
      tables.related[oldNode.item.id] ?? [],
      sources,
      id,
      report,
      pending,
    );

    return {
      id,
      title: oldNode.item.title,
      link,
      fields,
      children: convertTree(
        oldNode.children,
        ref?.children ?? null,
        tables,
        sources,
        fieldDefs,
        report,
        pending,
        depth + 1,
      ),
    };
  });
}

const safeParse = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/**
 * The whole normalization: old tables → one NormalizedNavigation per old
 * document (fr + en rows of "Navigation B2C" become ONE navigation with two
 * locale trees).
 */
export function normalizeAll(
  tables: OldTables,
  sources: SourcePattern[],
  fieldDefs: FieldDef[],
  { defaultLocale = "fr" }: { defaultLocale?: string } = {},
): NormalizedNavigation[] {
  const groups = new Map<string, OldNavigationRow[]>();
  for (const nav of tables.navigations) {
    // Draft/published rows share id-per-locale in v5's navigations table via
    // published_at pairs — keep one row per locale (published preferred).
    const list = groups.get(nav.document_id) ?? [];
    const existing = list.findIndex((n) => (n.locale ?? "") === (nav.locale ?? ""));
    if (existing >= 0) {
      if (nav.published_at && !list[existing].published_at) list[existing] = nav;
    } else {
      list.push(nav);
    }
    groups.set(nav.document_id, list);
  }

  const out: NormalizedNavigation[] = [];
  for (const [oldDocumentId, rows] of groups) {
    const ordered = [...rows].sort((a, b) => {
      // The default locale first: it becomes the id reference for pairing.
      const aDefault = (a.locale ?? "") === defaultLocale ? 0 : 1;
      const bDefault = (b.locale ?? "") === defaultLocale ? 0 : 1;
      return aDefault - bDefault;
    });

    const normalized: NormalizedNavigation = {
      oldDocumentId,
      name: ordered[0].name,
      slug: ordered[0].slug,
      visible: Boolean(ordered[0].visible),
      locales: {},
      pending: [],
      reports: {},
    };

    let reference: NavNode[] | null = null;
    for (const row of ordered) {
      const locale = row.locale ?? defaultLocale;
      if (normalized.locales[locale]) continue;
      const report = emptyReport();
      const oldTree = buildOldTree(row.id, tables);
      const pendingStart = normalized.pending.length;
      const tree = convertTree(
        oldTree,
        reference,
        tables,
        sources,
        fieldDefs,
        report,
        normalized.pending,
      );
      for (let i = pendingStart; i < normalized.pending.length; i += 1) {
        normalized.pending[i].locale = locale;
      }
      normalized.locales[locale] = tree;
      normalized.reports[locale] = report;
      reference ??= tree;
    }

    out.push(normalized);
  }
  return out;
}
