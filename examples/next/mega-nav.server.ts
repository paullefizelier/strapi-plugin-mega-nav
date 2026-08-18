/**
 * Next.js (App Router) — server-side data access. Put this in `lib/mega-nav.ts`.
 *
 * The token lives in a server-only env var and is read only here, so it can
 * never leak into the client bundle. Menus are cached and tagged, which means a
 * Strapi webhook can revalidate them instead of waiting out a TTL.
 */
import { fetchNavigation, type NavItem } from "../mega-nav";

const BASE_URL = process.env.STRAPI_URL ?? "http://localhost:1337";
const TOKEN = process.env.STRAPI_TOKEN; // server-only: no NEXT_PUBLIC_ prefix

export async function getNavigation(slug: string, locale?: string): Promise<NavItem[]> {
  return fetchNavigation(slug, {
    baseUrl: BASE_URL,
    token: TOKEN,
    locale,
    init: {
      next: {
        revalidate: 300,
        // Revalidate on demand: POST /api/revalidate-nav from a Strapi webhook
        // and call revalidateTag("mega-nav").
        tags: ["mega-nav", `mega-nav:${slug}`],
      },
    } as RequestInit,
  });
}

/**
 * Optional: an on-demand revalidation route. Put this in
 * `app/api/revalidate-nav/route.ts`.
 *
 * ```ts
 * import { revalidateTag } from "next/cache";
 * import { NextResponse, type NextRequest } from "next/server";
 *
 * export async function POST(request: NextRequest) {
 *   if (request.headers.get("x-webhook-secret") !== process.env.WEBHOOK_SECRET) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 *   revalidateTag("mega-nav");
 *   return NextResponse.json({ revalidated: true });
 * }
 * ```
 */
