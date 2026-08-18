import type { Core } from "@strapi/strapi";
import { translateBatch } from "./ai";
import { getFieldDefs } from "./fields";
import { resolveRefs } from "./sources";
import { applyTranslations, internalRefs, planTranslation } from "./translate";
import { walk, type NavNode } from "./tree";

/**
 * Cross-locale copy. Node ids are stable across locales — they are the
 * pairing key — so "structure" mode can sync the tree shape from a source
 * locale while keeping the target's own titles and field values wherever a
 * node already exists. Internal links carry over untouched: documentIds are
 * shared across locales in Strapi v5, and the render resolves them in the
 * requested locale.
 */

export const NAVIGATION_UID = "plugin::mega-nav.navigation";

export type CopyMode = "full" | "structure" | "translate";

/** Source shape and order win; target translations survive on paired ids. */
export function mergeTrees(source: NavNode[], target: NavNode[]): NavNode[] {
  const targetById = new Map<string, NavNode>();
  walk(target, (node) => targetById.set(node.id, node));

  const build = (nodes: NavNode[]): NavNode[] =>
    (nodes ?? []).map((src) => {
      const existing = targetById.get(src.id);
      return {
        ...src,
        title: existing?.title ?? src.title,
        fields: existing?.fields ?? src.fields,
        hidden: existing?.hidden ?? src.hidden,
        children: build(src.children ?? []),
      };
    });

  return build(source);
}

export interface CopyResult {
  items: number;
  /** Texts kept from the target because they were already translated. */
  kept: number;
  /** Texts rewritten by the provider (translate mode). */
  translated?: number;
  /** Texts sent but returned unusable — left in the source language. */
  untranslated?: number;
  /**
   * Entries linked by the menu that have no version in the target locale.
   * Those links resolve to nothing and the item renders as a heading, so they
   * are the first thing to fix after translating.
   */
  missingEntryTranslations?: { uid: string; documentId: string; title?: string }[];
}

export async function copyLocale(
  strapi: Core.Strapi,
  documentId: string,
  {
    from,
    to,
    mode = "full",
    overwrite = false,
  }: { from: string; to: string; mode?: CopyMode; overwrite?: boolean },
): Promise<CopyResult> {
  if (!from || !to || from === to) throw new Error("copy-locale needs two distinct locales");

  const source = (await strapi.documents(NAVIGATION_UID as never).findOne({
    documentId,
    locale: from,
    status: "draft",
  } as never)) as unknown as { items?: NavNode[] } | null;
  if (!source) throw new Error(`navigation ${documentId} has no "${from}" locale`);

  const sourceItems = (source.items ?? []) as NavNode[];
  let items: NavNode[] = JSON.parse(JSON.stringify(sourceItems));
  let kept = 0;
  const extra: Partial<CopyResult> = {};

  const readTarget = async (): Promise<NavNode[]> => {
    const target = (await strapi.documents(NAVIGATION_UID as never).findOne({
      documentId,
      locale: to,
      status: "draft",
    } as never)) as unknown as { items?: NavNode[] } | null;
    return (target?.items ?? []) as NavNode[];
  };

  if (mode === "structure") {
    const targetItems = await readTarget();
    const targetIds = new Set<string>();
    walk(targetItems, (node) => targetIds.add(node.id));
    items = mergeTrees(items, targetItems);
    walk(items, (node) => {
      if (targetIds.has(node.id)) kept += 1;
    });
  }

  if (mode === "translate") {
    const targetItems = await readTarget();
    const fieldDefs = await getFieldDefs(strapi);
    const plan = planTranslation(sourceItems, targetItems, fieldDefs, { overwrite });
    kept = plan.kept;
    items = plan.tree;

    if (plan.pending.length) {
      const answers = await translateBatch(
        strapi,
        plan.pending.map((slot) => slot.text),
        from,
        to,
      );
      const applied = applyTranslations(items, plan.pending, answers);
      items = applied.tree;
      extra.translated = applied.applied;
      extra.untranslated = plan.pending.length - applied.applied;
    } else {
      extra.translated = 0;
      extra.untranslated = 0;
    }

    // A link whose entry has no version in the target locale resolves to
    // nothing and renders as a heading — surface it rather than let it rot.
    const refs = internalRefs(items);
    if (refs.length) {
      const resolved = await resolveRefs(strapi, refs, to);
      extra.missingEntryTranslations = resolved
        .filter((r) => r.missing)
        .map((r) => ({ uid: r.uid, documentId: r.documentId }));
    }
  }

  // update() creates the locale variant when it doesn't exist yet.
  await strapi.documents(NAVIGATION_UID as never).update({
    documentId,
    locale: to,
    data: { items } as never,
  } as never);

  let total = 0;
  walk(items, () => {
    total += 1;
  });
  return { items: total, kept, ...extra };
}
