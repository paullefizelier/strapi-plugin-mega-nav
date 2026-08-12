import type { Core } from "@strapi/strapi";
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

export type CopyMode = "full" | "structure";

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
  /** Nodes that kept the target's translation (structure mode). */
  kept: number;
}

export async function copyLocale(
  strapi: Core.Strapi,
  documentId: string,
  { from, to, mode = "full" }: { from: string; to: string; mode?: CopyMode },
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

  if (mode === "structure") {
    const target = (await strapi.documents(NAVIGATION_UID as never).findOne({
      documentId,
      locale: to,
      status: "draft",
    } as never)) as unknown as { items?: NavNode[] } | null;
    const targetItems = (target?.items ?? []) as NavNode[];
    const targetIds = new Set<string>();
    walk(targetItems, (node) => targetIds.add(node.id));
    items = mergeTrees(items, targetItems);
    walk(items, (node) => {
      if (targetIds.has(node.id)) kept += 1;
    });
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
  return { items: total, kept };
}
