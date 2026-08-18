# Consuming the menu — starter templates

Copy-paste starting points for rendering a Mega Nav menu. They are **not** a
package: take the files, put them in your project, restyle them. Tailwind
classes are used for layout only — swap them for whatever you use.

Every template reads **`format=v2`**, the clean payload: one typed `link` object
per item and flat typed fields. (`format=v1` exists to keep sites built for
`strapi-plugin-navigation` working; new code has no reason to use it.)

| Template | Files | Notes |
|---|---|---|
| Core | [`mega-nav.ts`](./mega-nav.ts) | Types, fetch, helpers. **Every template needs this one.** Zero dependencies |
| React | [`react/MegaNav.tsx`](./react/MegaNav.tsx) | Plain React, no UI library. Items passed as a prop |
| Next.js | [`next/mega-nav.server.ts`](./next/mega-nav.server.ts) · [`next/SiteHeader.tsx`](./next/SiteHeader.tsx) | App Router, server component, cache tags for webhook revalidation |
| shadcn/ui | [`shadcn/MegaNav.tsx`](./shadcn/MegaNav.tsx) | Built on `NavigationMenu` — keyboard and ARIA handled for you |
| Nuxt | [`nuxt/server-api-navigation.ts`](./nuxt/server-api-navigation.ts) · [`nuxt/MegaNav.vue`](./nuxt/MegaNav.vue) | Server route + SWR cache, component reads the route |
| Astro | [`astro/MegaNav.astro`](./astro/MegaNav.astro) | Rendered in the frontmatter; ~15 lines of JS ship to the browser |

## The one rule: fetch on the server

The render endpoint is public by default, but as soon as you protect it with an
API token, **that token must stay server-side**. Every template above fetches
from a server context — a Next server component, a Nuxt server route, Astro
frontmatter — and passes plain data to the component. Calling Strapi from a
`useEffect` would put the token in your JavaScript bundle.

## What the payload looks like

```jsonc
[
  {
    "id": "01J…",
    "title": "Find a job",
    "link": { "kind": "none" },              // a heading: no target
    "fields": { "presentation": "columns" },
    "children": [
      {
        "id": "01J…",
        "title": "By sector",
        "link": { "kind": "none" },
        "fields": {},
        "children": [
          {
            "id": "01J…",
            "title": "Logistics",
            "link": { "kind": "internal", "href": "/sectors/logistics" },
            "fields": { "description": "Warehousing, transport, supply chain" },
            "children": []
          }
        ]
      }
    ]
  }
]
```

Three things worth knowing when you write your own renderer:

**`link.href` is the whole answer.** It is already resolved — the entry's current
URL, in the requested locale, with any query string and hash appended. When it is
absent the item is a heading; render a `<span>`, not a dead `<a>`. That also
covers a reference whose target was unpublished or deleted: it arrives as
`kind: "none"` rather than as a broken link.

**`fields` is what the editor filled**, typed: real booleans, media as objects
with `url`/`width`/`height`/`formats`. Which fields exist at which depth is your
layout's contract — the plugin's Layouts settings is where it's declared, and the
editor's item form follows it.

**Mirror the degradation rule.** A layout that needs level-2 groups (`columns`,
`split`, `banner`, `teams`) used on a flat tree must fall back to a flat list, or
you render empty columns. `effectiveLayout()` in the core file does this; the
plugin's editor warns about it before it ever reaches your site.

## Adding your own layouts

Each template maps `presentation` → a panel component, with a fallback:

```ts
const PANELS = { simple: SimplePanel, columns: ColumnsPanel };
const Panel = PANELS[effectiveLayout(item)] ?? SimplePanel;
```

The React template ships `simple`, a grouped `columns` (reused for `split` and
`banner`), plus `directory` (dense index), `tabs` (horizontal tabs) and
`brands` (tiles tinted by each item's `color`). The others ship the first two
and fall back for the rest — copy the panels across as you need them.

Add a case per layout you actually use, and declare it in the plugin's Layouts
settings so the editor offers the right fields at the right depth, previews it,
and lists it in the layout gallery.

## Not published to npm

These live in the repository only: the package ships `dist` alone, to keep the
install small. Browse them on GitHub or clone the repo.
