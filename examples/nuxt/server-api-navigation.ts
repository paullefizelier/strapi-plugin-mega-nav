/**
 * Nuxt — the server route that fronts Strapi. Put this in
 * `server/api/navigation/[slug].get.ts`.
 *
 * Going through a server route rather than calling Strapi from the component is
 * what keeps the API token server-side. Add to `nuxt.config.ts`:
 *
 * ```ts
 * runtimeConfig: {
 *   strapi: { url: process.env.STRAPI_URL, token: process.env.STRAPI_TOKEN },
 * }
 * ```
 *
 * (Private `runtimeConfig`, not `runtimeConfig.public` — anything public is
 * serialized into the client payload.)
 */
import { fetchNavigation, type NavItem } from "../mega-nav";

/**
 * SWR-cached: the header is fetched on every SSR render but its content rarely
 * changes. The locale is part of the key, so switching language doesn't serve
 * the other language's menu.
 */
const getNavigation = defineCachedFunction(
  async (baseUrl: string, token: string, slug: string, locale?: string): Promise<NavItem[]> =>
    fetchNavigation(slug, { baseUrl, token, locale }),
  {
    name: "mega-nav",
    maxAge: 300,
    swr: true,
    getKey: (_baseUrl, _token, slug: string, locale?: string) => `${slug}:${locale ?? "default"}`,
  },
);

export default defineEventHandler(async (event): Promise<NavItem[]> => {
  const slug = getRouterParam(event, "slug");
  if (!slug) return [];

  const { strapi } = useRuntimeConfig(event) as {
    strapi: { url: string; token: string };
  };
  const locale = getQuery(event).locale;

  return getNavigation(strapi.url, strapi.token, slug, locale ? String(locale) : undefined);
});
