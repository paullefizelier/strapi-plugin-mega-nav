/**
 * Next.js (App Router) — a server component that renders the header.
 * Put this in `components/site-header.tsx` and use it from a layout:
 *
 * ```tsx
 * // app/layout.tsx
 * import { SiteHeader } from "@/components/site-header";
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <SiteHeader slug="main-navigation" />
 *         {children}
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * The fetch happens on the server; only the rendered markup and the small
 * interactive client component reach the browser.
 */
import { getNavigation } from "../next/mega-nav.server";
import { MegaNav } from "../react/MegaNav"; // add "use client" at its top

export async function SiteHeader({
  slug = "main-navigation",
  locale,
}: {
  slug?: string;
  locale?: string;
}) {
  const items = await getNavigation(slug, locale);

  // An empty menu is a degraded state, not a crash: render the bar anyway so
  // the logo and the rest of the header stay usable.
  return (
    <header className="flex h-16 items-center justify-between border-b px-6">
      <a href="/" className="font-bold">
        Acme
      </a>
      {items.length ? <MegaNav items={items} /> : null}
    </header>
  );
}

export default SiteHeader;
