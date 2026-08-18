/**
 * Framework-agnostic core: types, fetch, and the two helpers every template
 * needs. Zero dependencies — copy this file as-is, then pick the template for
 * your framework.
 *
 * These examples read `format=v2`, the clean shape: one typed `link` object per
 * item and flat typed fields. (`v1` exists to keep sites built for
 * strapi-plugin-navigation working; new code has no reason to use it.)
 */

export type LinkKind = "internal" | "external" | "path" | "none";

export interface NavLink {
  kind: LinkKind;
  /** Absent on `none`, and on a reference whose target no longer resolves. */
  href?: string;
  query?: string;
  hash?: string;
}

export interface NavImage {
  url: string;
  alternativeText?: string;
  width?: number;
  height?: number;
  formats?: Record<string, { url: string; width?: number; height?: number }>;
}

/** Field values are typed: strings, real booleans, numbers, media objects. */
export type NavFieldValue = string | number | boolean | NavImage;

export interface NavItem {
  id: string;
  title: string;
  link: NavLink;
  fields: Record<string, NavFieldValue | undefined>;
  children: NavItem[];
}

/* -------------------------------------------------------------------------- */

export interface FetchOptions {
  /** Strapi origin, e.g. https://cms.example.com */
  baseUrl: string;
  /** API token. SERVER-SIDE ONLY — never ship it to the browser. */
  token?: string;
  locale?: string;
  /** `draft` renders the working copy; needs a token. */
  status?: "published" | "draft";
  /** Passed to fetch (Next revalidate, Astro cache…). */
  init?: RequestInit;
}

/**
 * Fetch one navigation. Returns `[]` rather than throwing: a header that loses
 * its menu should degrade to an empty bar, not take the page down with it.
 */
export async function fetchNavigation(
  slug: string,
  { baseUrl, token, locale, status, init }: FetchOptions,
): Promise<NavItem[]> {
  const url = new URL(`/api/mega-nav/render/${encodeURIComponent(slug)}`, baseUrl);
  url.searchParams.set("format", "v2");
  if (locale) url.searchParams.set("locale", locale);
  if (status) url.searchParams.set("status", status);

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as NavItem[]) : [];
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */

/** The href to render, or `null` when the item is a heading. */
export function hrefOf(item: NavItem): string | null {
  return item.link?.href ?? null;
}

/** True when the target should open in a new tab. */
export function isExternal(item: NavItem): boolean {
  return item.link?.kind === "external";
}

/** Anchor attributes for an item, including the external-link safety pair. */
export function linkProps(item: NavItem): {
  href: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
} | null {
  const href = hrefOf(item);
  if (!href) return null;
  return isExternal(item)
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : { href };
}

/** A typed field read, so templates don't repeat the casts. */
export const text = (item: NavItem, field: string): string | undefined => {
  const value = item.fields?.[field];
  return typeof value === "string" && value ? value : undefined;
};

export const flag = (item: NavItem, field: string): boolean =>
  item.fields?.[field] === true;

export const image = (item: NavItem, field = "image"): NavImage | undefined => {
  const value = item.fields?.[field];
  return value && typeof value === "object" && "url" in value ? (value as NavImage) : undefined;
};

/** The panel layout chosen on a level-1 item. */
export const presentation = (item: NavItem): string => text(item, "presentation") ?? "simple";

/**
 * Layouts that need level-2 groups. The render payload carries no layout
 * metadata, so this list lives here — extend it if you declare a grouped layout
 * of your own in the plugin's Layouts settings.
 */
export const DEFAULT_GROUPED_LAYOUTS = ["columns", "split", "banner", "teams"];

/**
 * Mirrors the plugin's degradation rule: a layout that needs level-2 groups,
 * used on a flat tree, renders as `simple`. Keep this — without it a mis-shaped
 * menu renders as empty columns instead of a usable list.
 */
export function effectiveLayout(
  item: NavItem,
  groupedLayouts: readonly string[] = DEFAULT_GROUPED_LAYOUTS,
): string {
  const layout = presentation(item);
  const grouped = item.children.some((child) => child.children.length > 0);
  return groupedLayouts.includes(layout) && !grouped ? "simple" : layout;
}
