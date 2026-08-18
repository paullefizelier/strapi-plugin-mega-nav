import { isTranslatable, type FieldDef } from "./fields";
import type { NavNode } from "./tree";

/**
 * Planning a translated copy — pure, so the decisions are testable without a
 * provider.
 *
 * The rule: structure, links and non-language fields come from the source (they
 * are the same in every locale); prose comes from the target when it already
 * holds a translation, and from the source — marked for translation — when it
 * doesn't. That is what makes the action safe to re-run: reviewed wording is
 * never silently replaced unless the caller asks for it.
 *
 * Internal links need no work at all: they reference a documentId shared across
 * locales, and the render resolves it in the requested locale.
 */

export interface TranslatableSlot {
  nodeId: string;
  /** `title`, or the name of a field. */
  key: string;
  /** Source text to translate. */
  text: string;
}

export interface TranslationPlan {
  tree: NavNode[];
  /** Texts the provider has to translate, in a stable order. */
  pending: TranslatableSlot[];
  /** Texts kept from the target because they were already translated. */
  kept: number;
}

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function planTranslation(
  source: NavNode[],
  target: NavNode[],
  fieldDefs: FieldDef[],
  { overwrite = false }: { overwrite?: boolean } = {},
): TranslationPlan {
  const defsByName = new Map(fieldDefs.map((d) => [d.name, d]));
  const targetById = new Map<string, NavNode>();
  const index = (nodes: NavNode[]): void => {
    for (const node of nodes ?? []) {
      targetById.set(node.id, node);
      index(node.children ?? []);
    }
  };
  index(target);

  const pending: TranslatableSlot[] = [];
  let kept = 0;

  const build = (nodes: NavNode[]): NavNode[] =>
    (nodes ?? []).map((src) => {
      const existing = targetById.get(src.id);

      let title = src.title;
      if (!overwrite && filled(existing?.title)) {
        title = existing!.title;
        kept += 1;
      } else if (filled(src.title)) {
        pending.push({ nodeId: src.id, key: "title", text: src.title });
      }

      const fields: NavNode["fields"] = {};
      for (const [name, value] of Object.entries(src.fields ?? {})) {
        const def = defsByName.get(name);
        if (!isTranslatable(def) || !filled(value)) {
          // Images, layouts, icons, URLs, lookup keys: same in every locale.
          fields[name] = value;
          continue;
        }
        const existingValue = existing?.fields?.[name];
        if (!overwrite && filled(existingValue)) {
          fields[name] = existingValue;
          kept += 1;
        } else {
          fields[name] = value; // replaced once the provider answers
          pending.push({ nodeId: src.id, key: name, text: value });
        }
      }

      return {
        ...src,
        title,
        fields,
        // `hidden` is an editorial choice per locale — the target's wins.
        hidden: existing?.hidden ?? src.hidden,
        children: build(src.children ?? []),
      };
    });

  return { tree: build(source), pending, kept };
}

/**
 * Write the provider's answers back. Anything missing or blank leaves the
 * source text in place — a partial answer degrades to "untranslated", never to
 * an empty menu.
 */
export function applyTranslations(
  tree: NavNode[],
  pending: TranslatableSlot[],
  translations: (string | undefined)[],
): { tree: NavNode[]; applied: number } {
  const bySlot = new Map<string, string>();
  pending.forEach((slot, i) => {
    const value = translations[i];
    if (typeof value === "string" && value.trim()) {
      bySlot.set(`${slot.nodeId}|${slot.key}`, value.trim());
    }
  });

  let applied = 0;
  const build = (nodes: NavNode[]): NavNode[] =>
    (nodes ?? []).map((node) => {
      const title = bySlot.get(`${node.id}|title`);
      const fields = { ...node.fields };
      for (const name of Object.keys(fields)) {
        const translated = bySlot.get(`${node.id}|${name}`);
        if (translated !== undefined) {
          fields[name] = translated;
          applied += 1;
        }
      }
      if (title !== undefined) applied += 1;
      return {
        ...node,
        title: title ?? node.title,
        fields,
        children: build(node.children ?? []),
      };
    });

  return { tree: build(tree), applied };
}

/** Internal references, so the caller can flag the ones missing in the target locale. */
export function internalRefs(tree: NavNode[]): { uid: string; documentId: string }[] {
  const out: { uid: string; documentId: string }[] = [];
  const seen = new Set<string>();
  const visit = (nodes: NavNode[]): void => {
    for (const node of nodes ?? []) {
      if (node.link?.kind === "internal" && node.link.documentId) {
        const key = `${node.link.uid}|${node.link.documentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ uid: node.link.uid, documentId: node.link.documentId });
        }
      }
      visit(node.children ?? []);
    }
  };
  visit(tree);
  return out;
}
