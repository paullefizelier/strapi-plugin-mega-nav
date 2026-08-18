import type { FieldValue, LayoutSpec, NavNode } from "../types";

/**
 * A believable menu for a layout, derived from the layout itself.
 *
 * The gallery has to show what a layout looks like before anyone has built one
 * with it. Hand-drawn mock trees would mean a mock per layout, and a layout you
 * add in the settings would show nothing — so the sample is generated from the
 * spec: one node per declared level, filled only with the fields that level
 * declares. Add a layout in the admin and its thumbnail appears for free.
 */

const TITLES: Record<string, string[]> = {
  root: ["Find a job"],
  group: ["By sector", "By contract", "By region", "By experience", "Top trades", "Remote"],
  tab: ["Industry", "Logistics", "Healthcare", "Construction"],
  team: ["Acme Talent", "Acme Medical", "Acme Experts"],
  link: [
    "Warehousing",
    "Maintenance",
    "Driving",
    "Nursing",
    "Site management",
    "Quality control",
    "Electrician",
    "Welding",
  ],
};

const SAMPLE_TEXT: Record<string, string> = {
  description: "A short line of copy",
  tagline: "The subtitle under it",
  ctaLabel: "See everything",
  ctaUrl: "/jobs",
  icon: "i-lucide-briefcase",
  offerBrand: "Acme Talent",
  color: "#a60000",
  imagePosition: "end",
  presentation: "",
};

/** A plausible value for a field, by name then by type. */
function sampleValue(field: string, index: number): FieldValue | undefined {
  if (field === "image") {
    // No real upload to point at: the preview draws its dashed placeholder,
    // which is the honest representation of "an image goes here".
    return undefined;
  }
  if (field === "highlight") return index === 0;
  const text = SAMPLE_TEXT[field];
  if (text === "") return undefined;
  return text ?? "Sample";
}

const pick = (role: string, index: number): string => {
  const pool = TITLES[role] ?? TITLES.link;
  return pool[index % pool.length] ?? `Item ${index + 1}`;
};

/**
 * How many children to draw at a level: the layout's own `min` when it asks for
 * one, otherwise enough to read as a menu without overflowing the thumbnail.
 */
const countFor = (spec: LayoutSpec, depth: number): number => {
  const level = spec.levels[depth];
  if (!level) return 0;
  const min = typeof level.min === "number" ? level.min : 0;
  const base = level.role === "link" ? 4 : 3;
  const max = typeof level.max === "number" ? level.max : Infinity;
  return Math.min(Math.max(min, base), max, 6);
};

export function sampleTreeFor(spec: LayoutSpec): NavNode {
  const build = (depth: number, index: number, idPrefix: string): NavNode => {
    const level = spec.levels[depth];
    const role = level?.role ?? "link";
    const fields: Record<string, FieldValue> = {};
    for (const use of level?.fields ?? []) {
      const value = sampleValue(use.field, index);
      if (value !== undefined) fields[use.field] = value;
    }
    if (depth === 0) fields.presentation = spec.key;

    const childCount = level?.childrenAllowed === false ? 0 : countFor(spec, depth + 1);
    return {
      id: `${idPrefix}-${depth}-${index}`,
      title: depth === 0 ? spec.label : pick(role, index),
      link: { kind: depth === 0 ? "none" : "path", path: "/sample" },
      fields,
      children: Array.from({ length: childCount }, (_, i) =>
        build(depth + 1, i, `${idPrefix}-${index}`),
      ),
    };
  };

  return build(0, 0, `sample-${spec.key}`);
}
