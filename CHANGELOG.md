# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/) — while on `0.x`, a minor bump may
carry breaking changes.

## [Unreleased]

### Added

- **Three layouts.** `directory` — a dense index with no promo, for sets too long
  for `columns` (every sector, every trade, every region). `tabs` — horizontal
  tabs over a grid of links, the lighter three-level cousin of `teams`.
  `brands` — tiles tinted by each item's accent colour, with a new `color` field.
- **A layout gallery.** Settings → Layouts shows a thumbnail per layout, and the
  presentation picker previews the layout it is about to apply. Names alone never
  told an editor what `bento` or `split` meant. Sample content is derived from the
  layout's own levels and fields, so a layout added in the admin gets a thumbnail
  without any code.

### Fixed

- **Preview templates now read their `params`.** Five of the six ignored them
  entirely — `cards` declared `cols: 3`, `simple` `columns: 1`, `bento`
  `heroFirst`, `teams` `depth: 4`, and the adapters dropped all of it. The
  metadata claimed to drive the preview while mostly decorating it. `linksPromo`
  also gains a `promo: "none"` mode and honours `cols`.

### Added (earlier in this cycle)

- **Export / import of the field and layout schemas.** Both settings screens gain
  a JSON download and upload, so a configuration built on staging can be moved to
  production. Storing these in the plugin store removed the "database silently
  overrides the config file" drift of file-based config; this is the promotion
  path that was missing to make that trade honest. Imports go through the same
  server validation as a manual edit.
- `needsGroups(spec)` on the server, derived from a layout's declared levels.

### Changed

- **Machine translation is no longer offered when no provider is configured.**
  The copy-locale dialog disables the translate mode and points at the settings
  screen, instead of failing on submit with a raw technical message.
- `validateFieldDefs` now validates `translatable` and `disabled`.
- The examples' grouped-layout list is a documented, overridable parameter
  (`DEFAULT_GROUPED_LAYOUTS`) rather than a hidden constant.

### Removed

- `GROUPED_LAYOUTS`, an unused export that was a third copy of the
  grouped-layout rule.

### Fixed

- The "Translatable" column header carries its explanatory hint, which existed
  in the translations but was never shown.

## [0.2.0] — 2026-08-18

### Added

- **Machine-translated menu copies.** "Copy from locale" gains a translate mode:
  it copies the structure and sends every label to a provider in one batched
  call, so labels are translated with their siblings for context. Internal links
  need no work — they reference a documentId shared across locales, which the
  render already resolves per locale.
- **Per-field translatability.** Prose is translated, identifiers are not.
  Rewriting an icon id, a CTA url or a lookup key would break a link silently.
- **Translation settings** (Google, OpenAI, Anthropic, Mistral) with the key
  stored server-side and a test button.
- **Optional description on level-3 links** in `split`, `banner` and `columns`,
  rendered inside the link so the whole block is the click target.
- **Starter templates** for React, Next.js, shadcn/ui, Nuxt and Astro, over a
  zero-dependency core carrying the types, the fetch and the link helpers.

### Notes

- The translate pass only fills gaps by default, so reviewed wording survives a
  re-run, and reports labels that came back unusable plus linked entries with no
  version in the target locale.

## [0.1.2] — 2026-08-17

### Added

- The README.

## [0.1.1] — 2026-08-14

### Fixed

- **The link stayed on the Internal tab when switching content type.** Choosing
  a content type emitted "no link", which the editor read as a wrapper and threw
  the form out of the Internal tab mid-selection. Choosing where to search is a
  browsing action, not a decision to drop the link.
- An unfinished internal link (entry never picked) is normalized to a heading on
  save, so the server never receives an incomplete link.

## [0.1.0] — 2026-08-13

First release.

### Added

- **Visual editor**: drag-and-drop tree with a keyboard path, an item form
  generated from the field schema and the layout's level spec, and a schematic
  preview whose one exact behaviour is the front's degradation rule.
- **True internal links**: items reference `{ uid, documentId }`; the URL is
  resolved at render time, so renaming an entry updates every menu.
- **Fields and layouts as data**, editable without a restart.
- **Native i18n**: one document, one localized tree per locale, node ids stable
  across locales, copy-from-locale.
- **Render API** at `/api/mega-nav/render/:slug`, with a `v1` payload compatible
  with `strapi-plugin-navigation` and a clean `v2`.
- **Migration** from `strapi-plugin-navigation`: reads the old tables directly,
  normalizes links, decodes stringified media and string booleans, pairs locales
  by tree position, and reports everything it guessed or dropped.
- **Health check** for broken references, dead media and hand-typed paths.
- RBAC actions `read`, `update`, `settings`, `migrate`.

[Unreleased]: https://github.com/paullefizelier/strapi-plugin-mega-nav/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/paullefizelier/strapi-plugin-mega-nav/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/paullefizelier/strapi-plugin-mega-nav/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/paullefizelier/strapi-plugin-mega-nav/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/paullefizelier/strapi-plugin-mega-nav/releases/tag/v0.1.0
