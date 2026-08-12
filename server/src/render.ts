import { joinHref, splitTarget } from "./links";
import type { MediaFile, ResolvedMaps } from "./resolve";
import { entryHref, type SourceConfig } from "./sources";
import type { FieldDef } from "./fields";
import type { FieldValue, NavNode } from "./tree";

/**
 * Serializers — pure functions over the tree plus the resolved maps.
 *
 * v1 reproduces the public payload of strapi-plugin-navigation's TREE render
 * so an existing front keeps working unchanged, minus its bugs: the path is
 * built per item from the resolved entry (never ancestor-concatenated, never
 * "/null"), booleans are real booleans, media URLs are absolute and carry
 * formats/dimensions.
 *
 * v2 is the clean opt-in shape: a typed link object and flattened typed
 * fields, pruned by per-level relevance.
 */

export interface RenderContext {
  resolved: ResolvedMaps;
  sources: Record<string, SourceConfig>;
  fieldDefs: FieldDef[];
  locale?: string;
  /** Origin prefixed to relative upload URLs; empty keeps them relative. */
  baseUrl?: string;
  maxDepth?: number;
  /** Omit items whose internal target is gone (default: degrade to WRAPPER). */
  dropBrokenLinks?: boolean;
  /** Mirror each item's resolved href into additionalFields.link (front escape-hatch compat). */
  emitLegacyLinkField?: boolean;
}

/** FNV-1a 32-bit — a stable numeric id for v1 consumers keying on `id`. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const absolutize = (url: string | undefined | null, baseUrl?: string): string | undefined => {
  if (!url) return undefined;
  return baseUrl && url.startsWith("/") ? `${baseUrl}${url}` : url;
};

function serializeMedia(file: MediaFile, baseUrl?: string) {
  const formats = file.formats
    ? Object.fromEntries(
        Object.entries(file.formats).map(([key, format]) => [
          key,
          { ...format, url: absolutize(format.url, baseUrl) as string },
        ]),
      )
    : undefined;
  return {
    url: absolutize(file.url, baseUrl) as string,
    alternativeText: file.alternativeText ?? undefined,
    width: file.width ?? undefined,
    height: file.height ?? undefined,
    ...(formats ? { formats } : {}),
  };
}

interface ResolvedLink {
  /** null when the link is broken (internal target gone / unresolvable). */
  href: string | null;
  kind: NavNode["link"]["kind"];
  query?: string;
  hash?: string;
}

function resolveLink(node: NavNode, ctx: RenderContext): ResolvedLink {
  const link = node.link ?? { kind: "none" as const };
  switch (link.kind) {
    case "none":
      return { kind: "none", href: null };
    case "external":
      return { kind: "external", href: link.url };
    case "path": {
      const { path, query, hash } = splitTarget(link.path);
      return { kind: "path", href: joinHref(path, query, hash), query, hash };
    }
    case "internal": {
      const source = ctx.sources[link.uid];
      const entry = ctx.resolved.entries[link.uid]?.[link.documentId];
      if (!source || !entry) return { kind: "internal", href: null };
      const base = entryHref(source, entry, ctx.locale);
      if (!base) return { kind: "internal", href: null };
      return {
        kind: "internal",
        href: joinHref(base, link.query, link.hash),
        query: link.query,
        hash: link.hash,
      };
    }
  }
}

function serializeFieldValue(
  value: FieldValue,
  ctx: RenderContext,
): unknown {
  if (value && typeof value === "object" && "media" in value) {
    const file = value.media?.id ? ctx.resolved.media[value.media.id] : undefined;
    // A deleted upload yields nothing — the zone renders empty rather than 404ing.
    return file ? serializeMedia(file, ctx.baseUrl) : undefined;
  }
  return value;
}

function relatedPayload(node: NavNode, ctx: RenderContext): Record<string, unknown> | undefined {
  if (node.link?.kind !== "internal") return undefined;
  const source = ctx.sources[node.link.uid];
  if (!source?.related) return undefined;
  const entry = ctx.resolved.entries[node.link.uid]?.[node.link.documentId];
  if (!entry) return undefined;

  const payload: Record<string, unknown> = { __type: node.link.uid };
  for (const field of source.related.fields ?? []) payload[field] = entry[field];
  for (const key of source.related.populate ?? []) {
    const value = entry[key] as MediaFile | MediaFile[] | null | undefined;
    if (!value) continue;
    payload[key] = Array.isArray(value)
      ? value.map((file) => serializeMedia(file, ctx.baseUrl))
      : serializeMedia(value, ctx.baseUrl);
  }
  return payload;
}

/** v1 — the strapi-plugin-navigation TREE shape. */
export function renderV1(nodes: NavNode[], ctx: RenderContext, depth = 1): Record<string, unknown>[] {
  const maxDepth = ctx.maxDepth ?? 4;
  if (depth > maxDepth) return [];
  const out: Record<string, unknown>[] = [];

  for (const node of nodes ?? []) {
    if (node.hidden) continue;
    const link = resolveLink(node, ctx);
    const broken = link.kind === "internal" && link.href === null;
    if (broken && ctx.dropBrokenLinks) continue;

    // v1 type mapping: internal & path are both INTERNAL; a broken internal
    // degrades to WRAPPER (children kept) so the heading still structures the menu.
    const type =
      link.kind === "external"
        ? "EXTERNAL"
        : (link.kind === "internal" && !broken) || link.kind === "path"
          ? "INTERNAL"
          : "WRAPPER";

    const additionalFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.fields ?? {})) {
      const serialized = serializeFieldValue(value, ctx);
      if (serialized !== undefined) additionalFields[key] = serialized;
    }
    if (ctx.emitLegacyLinkField && link.href && link.kind !== "external") {
      additionalFields.link = link.href;
    }

    const related = relatedPayload(node, ctx);

    out.push({
      id: fnv1a(node.id),
      title: node.title,
      type,
      ...(type === "INTERNAL" ? { path: link.href } : {}),
      ...(type === "EXTERNAL" ? { externalPath: link.href } : {}),
      items: renderV1(node.children ?? [], ctx, depth + 1),
      additionalFields,
      ...(related ? { related } : {}),
    });
  }
  return out;
}

/** v2 — typed link, flattened typed fields pruned by per-level relevance. */
export function renderV2(nodes: NavNode[], ctx: RenderContext, depth = 1): Record<string, unknown>[] {
  const maxDepth = ctx.maxDepth ?? 4;
  if (depth > maxDepth) return [];
  const defsByName = new Map(ctx.fieldDefs.map((d) => [d.name, d]));
  const out: Record<string, unknown>[] = [];

  for (const node of nodes ?? []) {
    if (node.hidden) continue;
    const link = resolveLink(node, ctx);
    const broken = link.kind === "internal" && link.href === null;
    if (broken && ctx.dropBrokenLinks) continue;

    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.fields ?? {})) {
      const def = defsByName.get(key);
      if (def?.levels?.length && !def.levels.includes(depth)) continue;
      const serialized = serializeFieldValue(value, ctx);
      if (serialized !== undefined) fields[key] = serialized;
    }

    out.push({
      id: node.id,
      title: node.title,
      link: broken
        ? { kind: "none" }
        : {
            kind: link.kind,
            ...(link.href ? { href: link.href } : {}),
            ...(link.query ? { query: link.query } : {}),
            ...(link.hash ? { hash: link.hash } : {}),
          },
      fields,
      children: renderV2(node.children ?? [], ctx, depth + 1),
    });
  }
  return out;
}
