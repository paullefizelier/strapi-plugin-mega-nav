import type { Core } from "@strapi/strapi";

/**
 * Layout metadata drives everything the editor knows about a presentation:
 * which levels exist, which fields feed which preview zones at each level, and
 * which wireframe template approximates it. It is DATA (core store, seeded
 * from the defaults below, admin-editable) so a new front-end layout can be
 * described without a plugin release.
 *
 * The defaults describe the reference front's ten mega-menu layouts; their
 * field/level matrix was read from the actual components.
 */

export interface FieldUse {
  /** FieldDef name. */
  field: string;
  /** Preview zone the value feeds — enables field ↔ zone cross-highlighting. */
  zone: string;
  required?: boolean;
  hint?: string;
}

export interface LevelSpec {
  /** Semantic role at this depth: root | link | group | team… */
  role: string;
  label: string;
  childrenAllowed: boolean;
  min?: number;
  max?: number;
  /** Items at this level are expected to carry a link — warn on wrappers. */
  linkExpected?: boolean;
  fields: FieldUse[];
}

export type PreviewTemplate =
  | "linkList"
  | "rowList"
  | "cardGrid"
  | "mosaic"
  | "linksPromo"
  | "tabsDetail";

export interface LayoutSpec {
  /** The `presentation` value. */
  key: string;
  label: string;
  /** Human recipe shown as help in the editor. */
  recipe: string;
  /** levels[0] = the level-1 item itself, levels[1] = its children, etc. */
  levels: LevelSpec[];
  preview: { template: PreviewTemplate; params: Record<string, unknown> };
}

const promoFields = (zone = "promo"): FieldUse[] => [
  { field: "description", zone: `${zone}.title`, hint: "Promo panel headline" },
  { field: "tagline", zone: `${zone}.subtitle` },
  { field: "image", zone: `${zone}.image` },
  { field: "ctaLabel", zone: `${zone}.cta` },
  { field: "ctaUrl", zone: `${zone}.cta` },
];

const linkLevel = (label = "Link"): LevelSpec => ({
  role: "link",
  label,
  childrenAllowed: false,
  linkExpected: true,
  fields: [],
});

export const DEFAULT_LAYOUTS: LayoutSpec[] = [
  {
    key: "simple",
    label: "Simple",
    recipe: "A plain list of links. Children: title (+ optional icon) + link.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
      {
        role: "link",
        label: "Link",
        childrenAllowed: false,
        linkExpected: true,
        fields: [{ field: "icon", zone: "link.icon" }],
      },
    ],
    preview: { template: "linkList", params: { columns: 1 } },
  },
  {
    key: "list",
    label: "List",
    recipe:
      "Icon rows + side promo. Root: description (promo title), tagline, image, image position, CTA. Children: title + icon + description + link.",
    levels: [
      {
        role: "root",
        label: "Menu",
        childrenAllowed: true,
        fields: [...promoFields(), { field: "imagePosition", zone: "promo.image" }],
      },
      {
        role: "link",
        label: "Row",
        childrenAllowed: false,
        linkExpected: true,
        fields: [
          { field: "icon", zone: "row.icon" },
          { field: "description", zone: "row.description" },
        ],
      },
    ],
    preview: { template: "rowList", params: {} },
  },
  {
    key: "cards",
    label: "Cards",
    recipe: "A grid of cards. Children: title + image (or icon) + description + link.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
      {
        role: "link",
        label: "Card",
        childrenAllowed: false,
        linkExpected: true,
        fields: [
          { field: "image", zone: "card.image" },
          { field: "icon", zone: "card.icon" },
          { field: "description", zone: "card.description" },
        ],
      },
    ],
    preview: { template: "cardGrid", params: { cols: 3 } },
  },
  {
    key: "featured",
    label: "Featured",
    recipe:
      "Links + promo panel. Root: description + tagline + image + CTA (promo). Children: title + icon + description + link.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: promoFields() },
      {
        role: "link",
        label: "Link",
        childrenAllowed: false,
        linkExpected: true,
        fields: [
          { field: "icon", zone: "link.icon" },
          { field: "description", zone: "link.description" },
        ],
      },
    ],
    preview: { template: "linksPromo", params: { promo: "right", grouped: false } },
  },
  {
    key: "bento",
    label: "Bento",
    recipe:
      "Mosaic of tiles — the FIRST child is the 2×2 hero tile (uses its description); the rest are small tiles. Children: title + image + link.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
      {
        role: "link",
        label: "Tile",
        childrenAllowed: false,
        // min/max on a level = expected item count AT that level: bento's
        // mosaic needs at least three tiles.
        min: 3,
        linkExpected: true,
        fields: [
          { field: "image", zone: "tile.image" },
          { field: "description", zone: "tile.description", hint: "Shown on the hero tile (first child) only" },
        ],
      },
    ],
    preview: { template: "mosaic", params: { heroFirst: true } },
  },
  {
    key: "split",
    label: "Split",
    recipe:
      "50/50: campaign visual left, link groups right. Root: image + description + tagline + CTA. Level 2: group titles. Level 3: links, each with an optional description shown under its label.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: promoFields() },
      { role: "group", label: "Group", childrenAllowed: true, min: 1, fields: [] },
      {
        ...linkLevel(),
        fields: [
          {
            field: "description",
            zone: "link.description",
            hint: "Optional line shown under the link label",
          },
        ],
      },
    ],
    preview: { template: "linksPromo", params: { promo: "left-split", grouped: true } },
  },
  {
    key: "banner",
    label: "Banner",
    recipe:
      "Link columns + bottom panoramic banner. Root: image + description + tagline + CTA (banner). Level 2: group titles. Level 3: links, each with an optional description shown under its label.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: promoFields() },
      { role: "group", label: "Group", childrenAllowed: true, min: 1, fields: [] },
      {
        ...linkLevel(),
        fields: [
          {
            field: "description",
            zone: "link.description",
            hint: "Optional line shown under the link label",
          },
        ],
      },
    ],
    preview: { template: "linksPromo", params: { promo: "bottom-banner", grouped: true } },
  },
  {
    key: "preview",
    label: "Preview",
    recipe:
      "Links left, visual panel right that follows the hovered link. Root: image (resting visual) + tagline. Children: title + image + description + link.",
    levels: [
      {
        role: "root",
        label: "Menu",
        childrenAllowed: true,
        fields: [
          { field: "image", zone: "promo.image", hint: "Resting visual before any hover" },
          { field: "tagline", zone: "promo.subtitle" },
        ],
      },
      {
        role: "link",
        label: "Link",
        childrenAllowed: false,
        linkExpected: true,
        fields: [
          { field: "image", zone: "link.image", hint: "Shown in the panel when hovered" },
          { field: "description", zone: "link.description" },
        ],
      },
    ],
    preview: { template: "linksPromo", params: { promo: "hover", grouped: false } },
  },
  {
    key: "columns",
    label: "Columns",
    recipe:
      "Grouped columns + right promo. Root: image + description (promo title) + tagline + CTA. Level 2 (groups): title + optional description, CTA, highlight. Level 3: links, each with an optional description shown under its label.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: promoFields() },
      {
        role: "group",
        label: "Group",
        childrenAllowed: true,
        min: 1,
        fields: [
          { field: "description", zone: "group.description" },
          { field: "highlight", zone: "group.highlight", hint: "Accent ring on the column" },
          { field: "ctaLabel", zone: "group.cta" },
          { field: "ctaUrl", zone: "group.cta" },
        ],
      },
      {
        ...linkLevel(),
        fields: [
          {
            field: "description",
            zone: "link.description",
            hint: "Optional line shown under the link label",
          },
        ],
      },
    ],
    preview: { template: "linksPromo", params: { promo: "right", grouped: true, cols: 4 } },
  },
  {
    key: "teams",
    label: "Teams",
    recipe:
      "Three panes: promo, team list, active team's links. Root: description + image + footer CTA (label AND url). Level 2 (teams): title + description + tagline + image + CTA + offerBrand. Level 3: group titles. Level 4: links.",
    levels: [
      {
        role: "root",
        label: "Menu",
        childrenAllowed: true,
        fields: [
          { field: "description", zone: "promo.title" },
          { field: "image", zone: "promo.image" },
          { field: "ctaLabel", zone: "footer.cta", hint: "Footer CTA — label and url both required" },
          { field: "ctaUrl", zone: "footer.cta" },
        ],
      },
      {
        role: "team",
        label: "Team",
        childrenAllowed: true,
        fields: [
          { field: "description", zone: "team.description" },
          { field: "tagline", zone: "team.tagline" },
          { field: "image", zone: "team.image" },
          { field: "ctaLabel", zone: "team.cta" },
          { field: "ctaUrl", zone: "team.cta" },
          { field: "offerBrand", zone: "team.offers", hint: "Key used for live offer counts" },
        ],
      },
      { role: "group", label: "Group", childrenAllowed: true, fields: [] },
      linkLevel(),
    ],
    preview: { template: "tabsDetail", params: { depth: 4 } },
  },
  {
    key: "directory",
    label: "Directory",
    recipe:
      "A dense index for long lists — sectors, trades, locations. No promo: the links take the whole panel. Level 2: column headings (a theme, or an initial). Level 3: links, each with an optional description.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
      { role: "group", label: "Column heading", childrenAllowed: true, min: 1, fields: [] },
      {
        ...linkLevel(),
        fields: [
          {
            field: "description",
            zone: "link.description",
            hint: "Optional line shown under the link label",
          },
        ],
      },
    ],
    // Six narrow columns and no promo — this layout is about density.
    preview: { template: "linksPromo", params: { promo: "none", grouped: true, cols: 6 } },
  },
  {
    key: "tabs",
    label: "Tabs",
    recipe:
      "Horizontal tabs over a grid of links — for a handful of heavy categories. Level 2: the tabs. Level 3: groups inside the active tab. Level 4: links.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
      {
        role: "tab",
        label: "Tab",
        childrenAllowed: true,
        min: 2,
        max: 6,
        fields: [{ field: "icon", zone: "link.icon" }],
      },
      { role: "group", label: "Group", childrenAllowed: true, fields: [] },
      linkLevel(),
    ],
    preview: { template: "tabsDetail", params: { orientation: "horizontal", promo: false } },
  },
  {
    key: "brands",
    label: "Brands",
    recipe:
      "A grid of tiles, each tinted by its own accent colour — for a group of brands or entities. Children: title + colour + logo or image + description + link.",
    levels: [
      { role: "root", label: "Menu", childrenAllowed: true, fields: [] },
      {
        role: "link",
        label: "Brand",
        childrenAllowed: false,
        linkExpected: true,
        min: 2,
        fields: [
          { field: "image", zone: "card.image", hint: "Logo or visual" },
          { field: "color", zone: "card.accent", hint: "Tints the tile — e.g. #a60000" },
          { field: "description", zone: "card.description" },
        ],
      },
    ],
    preview: { template: "cardGrid", params: { cols: 3, accent: "color" } },
  },
];

/**
 * Whether a layout needs level-2 groups — the rule behind the front's fallback.
 * Derived from the spec rather than a hardcoded list, so a layout added in the
 * admin is covered without a release.
 */
export const needsGroups = (spec: LayoutSpec): boolean => spec.levels.length >= 3;

export function validateLayoutSpecs(specs: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(specs)) return ["layouts must be an array"];
  const seen = new Set<string>();
  specs.forEach((raw, i) => {
    const at = `layouts[${i}]`;
    const spec = (raw ?? {}) as Partial<LayoutSpec>;
    if (typeof spec.key !== "string" || !spec.key) errors.push(`${at}: missing key`);
    else if (seen.has(spec.key)) errors.push(`${at}: duplicate key "${spec.key}"`);
    else seen.add(spec.key);
    if (typeof spec.label !== "string" || !spec.label) errors.push(`${at}: missing label`);
    if (!Array.isArray(spec.levels) || !spec.levels.length) {
      errors.push(`${at}: needs at least one level`);
    } else {
      spec.levels.forEach((level, j) => {
        if (typeof level?.role !== "string" || !level.role) errors.push(`${at}.levels[${j}]: missing role`);
        if (!Array.isArray(level?.fields)) errors.push(`${at}.levels[${j}]: fields must be an array`);
      });
    }
    if (!spec.preview || typeof spec.preview.template !== "string") {
      errors.push(`${at}: missing preview.template`);
    }
  });
  return errors;
}

const store = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "mega-nav" });

export async function getLayoutSpecs(strapi: Core.Strapi): Promise<LayoutSpec[]> {
  const stored = (await store(strapi).get({ key: "layouts" })) as LayoutSpec[] | null;
  return stored?.length ? stored : DEFAULT_LAYOUTS;
}

export async function setLayoutSpecs(strapi: Core.Strapi, specs: LayoutSpec[]): Promise<void> {
  const errors = validateLayoutSpecs(specs);
  if (errors.length) throw new Error(errors.join("; "));
  await store(strapi).set({ key: "layouts", value: specs });
}

export async function seedLayoutSpecs(strapi: Core.Strapi): Promise<void> {
  const stored = (await store(strapi).get({ key: "layouts" })) as LayoutSpec[] | null;
  if (!stored?.length) await store(strapi).set({ key: "layouts", value: DEFAULT_LAYOUTS });
}

/** "Restore defaults" in Settings — discards every stored customization. */
export async function resetLayoutSpecs(strapi: Core.Strapi): Promise<LayoutSpec[]> {
  await store(strapi).set({ key: "layouts", value: DEFAULT_LAYOUTS });
  return DEFAULT_LAYOUTS;
}
