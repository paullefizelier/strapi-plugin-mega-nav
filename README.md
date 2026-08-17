# Strapi Mega Nav

**A navigation plugin that lets editors see the menu they are building.** Drag
and drop the tree, watch the mega-menu panel redraw as you type, and link to a
content entry instead of typing its URL — so the menu follows the entry when its
slug changes.

Built for sites whose header is a real mega-menu: several panel layouts, four
levels deep, rich editorial content per item, more than one locale. It ships an
importer for [`strapi-plugin-navigation`](https://github.com/VirtusLab-Open-Source/strapi-plugin-navigation)
data and a render endpoint compatible with its payload, so an existing site can
switch over without touching its front-end code.

## Why another navigation plugin

Menus tend to be modelled as rows of items, each holding a hand-typed path. That
model leaks in ways that only show up in production:

| Symptom | Where it comes from |
|---|---|
| Paths like `/null/null/jobs` or `/2/entreprises/…` | The path is concatenated from ancestors, and wrappers contribute empty or numeric segments |
| Editors type `EXTERNAL` + a relative path for internal links | The "internal" type computes a path they can't control, so they route around it |
| A renamed entry silently 404s from the menu | The URL was copied into the menu, not referenced |
| Custom field config needs a server restart | The config is seeded into the database, then the file is ignored |
| Every custom field offered at every depth | Nothing knows that `highlight` only means something on a column |
| A layout silently renders as something else | Nothing checks the tree shape the layout needs |

This plugin takes the other branch on each of those.

## What you get

### A visual editor

One page holds the whole thing: a navigation and locale switcher, the tree, and
the item form. The **schematic preview** above the tree redraws as you edit,
using your real titles, images and CTAs inside a wireframe of the chosen layout.

It is deliberately not a screenshot of your site — it is an honest approximation
whose one exact behaviour is the **degradation rule**: a layout that needs
grouped children, dropped on a flat tree, previews as the fallback with a red
banner saying so. That mismatch is invisible in a CMS and expensive on a site.

The **tree** is a flattened drag-and-drop list: drag vertically to reorder,
horizontally to change depth, with the drop indicator turning red when a move
would exceed what the layout renders. Every move also exists as a menu command
(Move up/down, Indent/Outdent) — which is the keyboard and screen-reader path,
and the fallback when a drag feels fiddly.

### Real internal links

An item points at `{ uid, documentId }` — a reference, not a URL. The address is
computed at render time from the entry itself, so renaming a page updates the
menu everywhere it appears. Editors pick the entry from an autocomplete over the
allowed content types, which shows each candidate's resolved path and flags the
unpublished ones.

Four link kinds, and no fifth escape hatch:

| Kind | Meaning |
|---|---|
| `internal` | A content entry, optionally with a query string and hash |
| `external` | An absolute URL |
| `path` | A hand-typed internal path — allowed, and reported by the health check |
| `none` | A heading that structures the menu without linking anywhere |

A reference whose target was deleted or unpublished degrades to a heading and
keeps its children, rather than rendering a dead link. `GET /health` lists every
such case, plus dead media and every `path` escape hatch, so drift is visible
before a visitor finds it.

### Fields that are data, not config

Custom item fields live in the plugin store and are edited from
**Settings → Mega Nav → Fields**. A change applies to the next request — there
is no config file to edit, no restart, and no "the database overrides the file"
drift, because there is exactly one authority.

Ten fields ship as the default schema: `presentation`, `description`, `icon`,
`image`, `imagePosition`, `ctaLabel`, `ctaUrl`, `tagline`, `highlight`,
`offerBrand`. Types available: `string`, `text`, `boolean`, `select`, `media`,
`url`, `number`.

Deleting a field that holds data asks you to choose: **disable** it (hidden from
the form, values preserved) or **delete and purge** (values stripped from every
tree, behind a typed confirmation). Nothing disappears by accident.

### Layouts that describe themselves

A layout is metadata: which levels exist, what each level is called, how many
children it expects, which fields feed which zone of the panel, and which
wireframe approximates it. Ten layouts ship as defaults — `simple`, `list`,
`cards`, `featured`, `bento`, `split`, `banner`, `preview`, `columns`, `teams` —
and they are editable from **Settings → Mega Nav → Layouts**, with a reset.

That metadata is what drives the item form: at each depth you get the fields the
layout actually uses, with the hint that explains what they do *there*. Anything
else sits in an "Other fields" accordion, flagged when it holds a value the
current layout ignores — so switching layouts never silently eats content.

It also drives the lint, which reports a layout that will degrade, a level that
expects a link but got a heading, a required field left empty, a child count
outside the declared range, and any broken reference. Findings appear as a badge
on the row, a marker in the preview, and a clickable list.

### i18n without a parallel menu

One navigation document, one variant per locale, linked natively. Node ids are
stable across locales, which is what makes **Copy from locale** able to sync the
structure while keeping the translations already done on the target.

Internal references need no translation at all: document ids are shared across
locales in Strapi v5, so the render resolves each reference *in the requested
locale* — the French menu gets the French slug, the English one the English slug,
from the same reference.

## Install

```bash
npm install strapi-plugin-mega-nav
```

Enable it and declare which content types can be linked to:

```ts
// config/plugins.ts
export default ({ env }) => ({
  "mega-nav": {
    enabled: true,
    config: {
      sources: [
        // `pathField` when the entry stores its own full path…
        { uid: "api::page.page", titleField: "title", pathField: "path" },
        // …`pattern` when the URL is composed. Tokens read the entry;
        // `{locale}` reads the requested locale.
        { uid: "api::article.article", titleField: "Title", pattern: "/blog/{Slug}" },
        {
          uid: "api::team.team",
          titleField: "name",
          pattern: "/teams/{slug}",
          // Exposed under `related` in the render, for a front that wants to
          // read the entry's own data instead of duplicating it in the menu.
          related: { fields: ["entity", "color"], populate: ["logo", "heroImage"] },
        },
      ],
      maxDepth: 4,                 // tree depth cap (default 4)
      cache: { ttl: 60 },          // render cache, seconds (default 60)
      dropBrokenLinks: false,      // false: a dead reference becomes a heading
      emitLegacyLinkField: true,   // mirror the resolved href into additionalFields.link (v1)
      claimLegacyRoute: false,     // also serve /api/navigation/render/:slug
    },
  },
});
```

Restart Strapi, then open **Navigation** in the admin menu. Item fields and
layouts are *not* configured here — they are edited from Settings, live.

`sources` is the one thing that belongs in a file: it is bound to content types,
which only change with a deploy.

## Render API

```
GET /api/mega-nav/render/<slug-or-documentId>
```

| Parameter | Values | Default |
|---|---|---|
| `locale` | a locale code | the default locale |
| `format` | `v1`, `v2` | `v1` |
| `status` | `published`, `draft` | `published` |

Public by default, like any content-API route: grant the `render` permission to
the roles that need it, or call it with an API token. `status=draft` renders the
working copy, for a preview environment. Only navigations flagged `visible` are
served.

Published renders are cached in-process for `cache.ttl` seconds, and the whole
cache is dropped whenever a navigation, a source entry or an upload is written —
so an editor's publish is visible on the next request rather than after a TTL.

### `format=v1` — compatible payload

Reproduces the public shape of `strapi-plugin-navigation`'s TREE render, so a
front built for it keeps working:

```jsonc
[
  {
    "id": 3021025536,          // stable numeric hash of the node id
    "title": "Find a job",
    "type": "WRAPPER",         // INTERNAL | EXTERNAL | WRAPPER
    "path": "/jobs?family=Logistics",   // resolved, per item — never concatenated
    "externalPath": "https://…",        // EXTERNAL only
    "items": [ /* … */ ],
    "additionalFields": {
      "presentation": "columns",
      "highlight": true,       // a real boolean
      "image": {               // absolute URL, with formats and dimensions
        "url": "https://…/promo.png",
        "alternativeText": "…",
        "width": 1200, "height": 630,
        "formats": { "small": { "url": "https://…", "width": 500 } }
      }
    },
    "related": { "__type": "api::team.team", "entity": "…", "logo": { "url": "…" } }
  }
]
```

Same field names, minus the defects: the path is built per item from its own
entry, absent on headings and never polluted with `/null` or numeric segments;
booleans are booleans; media URLs are absolute and carry `formats`. Unknown keys
found in legacy data are passed through untouched. `type=TREE` is accepted and
ignored, so existing query strings keep working.

### `format=v2` — the clean shape

```jsonc
[
  {
    "id": "01J…",                                    // the stable node id
    "title": "All offers",
    "link": { "kind": "internal", "href": "/jobs", "query": "family=Logistics" },
    "fields": { "icon": "briefcase" },               // typed, flat, pruned per level
    "children": []
  }
]
```

A typed link object instead of the `type`/`path`/`externalPath` trio, fields
flattened and pruned to the levels they apply to. Worth adopting when you touch
the front anyway; `v1` stays supported.

## Migrating from strapi-plugin-navigation

**Settings → Mega Nav → Migration** reads the old plugin's tables directly — it
works whether the plugin is still installed or already removed, and both can
coexist during the transition (different tables, different API prefix).

Four steps: **detection** lists what was found, **options** let you allow
overwriting navigations that already exist here, **simulation** runs the entire
pipeline — reads, link normalization, media checks, locale pairing — without
writing anything, and **import** replays exactly what the simulation reported,
behind a typed confirmation when it would replace existing content.

What it does with the old data:

- **Links are normalized.** The old free-text `link` field wins where it was set,
  and relative paths are matched back against your `sources` patterns to become
  real internal references. What can't be matched stays a `path` and is listed.
- **`additionalFields` are decoded.** Media were stored as stringified objects and
  booleans as `"true"`/`"false"`; both are restored to real values, and media are
  re-linked after checking the file still exists.
- **Unknown keys are kept.** Orphan keys from a removed field are preserved in the
  tree and reported, instead of being dropped.
- **Locales are paired by tree position**, so a node keeps one id across locales
  and the copy-from-locale workflow works on migrated content. Anything unpaired
  is counted.
- **Duplicate morph rows** pointing at the draft and published row of the same
  entry are deduplicated.

The report — per navigation and locale: items, link kinds, reverse matches, media
re-linked or missing, unknown keys, unpaired nodes — is shown, exportable as JSON,
and stored. Re-running is idempotent: an existing slug is skipped unless you
opted into overwriting.

Once you are satisfied, point your front at `/api/mega-nav/render/…`, or set
`claimLegacyRoute: true` to also answer on `/api/navigation/render/…` and change
nothing at all — then uninstall the old plugin.

## Admin API

Every route requires an authenticated admin plus one permission, registered under
**Settings → Roles → Plugins → Mega Nav**: `read`, `update`, `settings`, `migrate`.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/mega-nav/navigations` | read |
| `POST` | `/mega-nav/navigations` | update |
| `GET` · `PUT` · `DELETE` | `/mega-nav/navigations/:documentId` | read · update · update |
| `POST` | `/mega-nav/navigations/:documentId/publish` | update |
| `POST` | `/mega-nav/navigations/:documentId/copy-locale` | update |
| `GET` · `PUT` | `/mega-nav/fields` | read · settings |
| `POST` | `/mega-nav/fields/:name/purge` | settings |
| `GET` · `PUT` | `/mega-nav/layouts` | read · settings |
| `POST` | `/mega-nav/layouts/reset` | settings |
| `GET` | `/mega-nav/sources` · `/mega-nav/sources/:uid/entries` | read |
| `POST` | `/mega-nav/entries/resolve` | read |
| `GET` | `/mega-nav/health` | read |
| `POST` | `/mega-nav/migration/scan` · `/mega-nav/migration/run` | migrate |

`PUT /navigations/:documentId` takes the whole tree and accepts the `updatedAt`
you loaded; a mismatch answers **409** rather than overwriting a colleague's work,
and the editor offers to reload or overwrite.

## Data model

One document per menu, one localized JSON tree per locale:

```ts
interface NavNode {
  id: string          // stable across locales — the i18n pairing key
  title: string
  link:
    | { kind: "internal"; uid: string; documentId: string; query?: string; hash?: string }
    | { kind: "external"; url: string }
    | { kind: "path"; path: string }
    | { kind: "none" }
  fields: Record<string, string | number | boolean | { media: { id: number; documentId: string } }>
  hidden?: boolean    // kept in the tree, excluded from the render
  children: NavNode[]
}
```

Storing the tree as one value — rather than rows joined by parent links — is what
makes a drag atomic, a publish all-or-nothing, and orphan rows impossible. The
costs are paid where they arise: references are resolved in batch at render time,
which takes two to four queries for a whole menu regardless of its size.

The content type is `plugin::mega-nav.navigation` (table `mega_nav_navigations`),
hidden from the Content Manager and the Content-Type Builder on purpose — the
plugin ships its own editor, and raw JSON is an invitation to corrupt it.

## How it degrades

| Situation | Behaviour |
|---|---|
| A referenced entry is unpublished or deleted | The item becomes a heading and keeps its children; listed in `/health` |
| A referenced media is gone | The field renders empty rather than a broken image |
| A source is removed from the config | Items pointing at it become headings |
| A layout is used on a tree it can't render | The front's fallback applies, and the editor showed it in red beforehand |
| A field is disabled | Hidden from the form, values preserved and still rendered |
| The plugin is uninstalled | The tree stays readable JSON in one column |

## Compatibility

Strapi **v5**. Node **>= 18**. Requires `@strapi/plugin-i18n` for localized
navigations.

## Development

```bash
npm install
npm test          # vitest, on the pure logic: tree, links, render, migration, lint
npm run build
npm run verify
```

The migration's normalizer has a probe that runs against a real dataset when you
point it at one:

```bash
MEGANAV_REAL_DATA=/path/to/exported/json npx vitest run normalize.realdata
```

## License

MIT
