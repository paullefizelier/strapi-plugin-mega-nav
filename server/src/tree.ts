import * as crypto from "node:crypto";
import type { FieldDef } from "./fields";

/**
 * The navigation tree — ONE ordered JSON value per navigation-locale.
 *
 * Storing the tree as a single document attribute (instead of item rows with
 * parent/master relations, the old plugin's model) buys atomic saves, atomic
 * publishes, trivial drag & drop and zero orphan rows. The costs are handled
 * where they arise: media and internal targets are stored as references and
 * resolved in batch at render time.
 */

export type NavLink =
  /** A content entry — the URL follows the entry, never stored. */
  | { kind: "internal"; uid: string; documentId: string; query?: string; hash?: string }
  | { kind: "external"; url: string }
  /** A hand-typed internal path — the escape hatch, reported by /health. */
  | { kind: "path"; path: string }
  /** A wrapper: grouping heading, no target. */
  | { kind: "none" };

/**
 * Media snapshot: id/documentId are the reference; url/alternativeText are a
 * display cache for the admin preview. The render always re-resolves fresh.
 */
export interface MediaRef {
  id: number;
  documentId: string;
  url?: string;
  alternativeText?: string;
}

export type FieldValue = string | number | boolean | { media: MediaRef };

export interface NavNode {
  /** Stable ACROSS locales — the i18n pairing key. Never regenerated. */
  id: string;
  title: string;
  link: NavLink;
  /** Custom field values, keyed by FieldDef name. Unknown keys are tolerated (legacy data). */
  fields: Record<string, FieldValue>;
  /** Kept in the tree but excluded from the render (replaces menuAttached=false). */
  hidden?: boolean;
  children: NavNode[];
}

export const newNodeId = (): string => crypto.randomUUID();

/** Depth-first visit; depth starts at 1 for root items. */
export function walk(
  nodes: NavNode[],
  visit: (node: NavNode, depth: number, parent: NavNode | null) => void,
  depth = 1,
  parent: NavNode | null = null,
): void {
  for (const node of nodes ?? []) {
    visit(node, depth, parent);
    walk(node.children ?? [], visit, depth + 1, node);
  }
}

export interface CollectedRefs {
  /** uid → set of documentIds referenced by internal links. */
  internal: Record<string, Set<string>>;
  /** Media file ids referenced by media field values. */
  mediaIds: Set<number>;
}

export function collectRefs(nodes: NavNode[]): CollectedRefs {
  const internal: Record<string, Set<string>> = {};
  const mediaIds = new Set<number>();
  walk(nodes, (node) => {
    if (node.link?.kind === "internal") {
      (internal[node.link.uid] ??= new Set()).add(node.link.documentId);
    }
    for (const value of Object.values(node.fields ?? {})) {
      if (value && typeof value === "object" && "media" in value && value.media?.id) {
        mediaIds.add(value.media.id);
      }
    }
  });
  return { internal, mediaIds };
}

const LINK_KINDS = new Set(["internal", "external", "path", "none"]);

function checkLink(link: unknown, at: string, errors: string[]): void {
  if (!link || typeof link !== "object") {
    errors.push(`${at}: link is required`);
    return;
  }
  const l = link as Record<string, unknown>;
  if (!LINK_KINDS.has(l.kind as string)) {
    errors.push(`${at}: unknown link kind "${String(l.kind)}"`);
    return;
  }
  if (l.kind === "internal" && (!l.uid || !l.documentId)) {
    errors.push(`${at}: internal link needs uid and documentId`);
  }
  if (l.kind === "external" && (typeof l.url !== "string" || !l.url.trim())) {
    errors.push(`${at}: external link needs a url`);
  }
  if (l.kind === "path" && (typeof l.path !== "string" || !l.path.startsWith("/"))) {
    errors.push(`${at}: path link needs a path starting with "/"`);
  }
}

function checkFieldValue(
  def: FieldDef | undefined,
  value: FieldValue,
  key: string,
  at: string,
  errors: string[],
): void {
  // Unknown keys are legacy data carried through migration — tolerated, but
  // their values must still be representable.
  if (value && typeof value === "object") {
    const media = (value as { media?: MediaRef }).media;
    if (!media || typeof media.id !== "number" || typeof media.documentId !== "string") {
      errors.push(`${at}: field "${key}" object value must be { media: { id, documentId } }`);
    }
    if (def && def.type !== "media") {
      errors.push(`${at}: field "${key}" is ${def.type}, got a media value`);
    }
    return;
  }
  if (!def) return;
  const t = typeof value;
  if (def.type === "boolean" && t !== "boolean") {
    errors.push(`${at}: field "${key}" must be a boolean`);
  } else if (def.type === "number" && t !== "number") {
    errors.push(`${at}: field "${key}" must be a number`);
  } else if (def.type === "media") {
    errors.push(`${at}: field "${key}" must be { media: { id, documentId } }`);
  } else if (["string", "text", "url", "select"].includes(def.type) && t !== "string") {
    errors.push(`${at}: field "${key}" must be a string`);
  } else if (def.type === "select" && def.options?.length && !def.options.includes(value as string)) {
    errors.push(`${at}: field "${key}" value "${String(value)}" is not one of [${def.options.join(", ")}]`);
  }
}

/**
 * Structural validation, run on every PUT. Returns human-readable errors —
 * empty array means the tree is safe to store.
 */
export function validateTree(
  nodes: unknown,
  fieldDefs: FieldDef[],
  { maxDepth = 4 }: { maxDepth?: number } = {},
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(nodes)) return ["items must be an array"];

  const defsByName = new Map(fieldDefs.map((d) => [d.name, d]));
  const seenIds = new Set<string>();

  const visit = (list: unknown[], depth: number, prefix: string): void => {
    if (depth > maxDepth) {
      errors.push(`${prefix}: depth ${depth} exceeds maxDepth ${maxDepth}`);
      return;
    }
    list.forEach((raw, index) => {
      const at = `${prefix}[${index}]`;
      if (!raw || typeof raw !== "object") {
        errors.push(`${at}: not an object`);
        return;
      }
      const node = raw as Record<string, unknown>;
      if (typeof node.id !== "string" || !node.id) {
        errors.push(`${at}: missing id`);
      } else if (seenIds.has(node.id)) {
        errors.push(`${at}: duplicate id "${node.id}"`);
      } else {
        seenIds.add(node.id);
      }
      if (typeof node.title !== "string" || !node.title.trim()) {
        errors.push(`${at}: missing title`);
      }
      checkLink(node.link, at, errors);
      if (node.hidden !== undefined && typeof node.hidden !== "boolean") {
        errors.push(`${at}: hidden must be a boolean`);
      }
      const fields = node.fields ?? {};
      if (typeof fields !== "object" || Array.isArray(fields)) {
        errors.push(`${at}: fields must be an object`);
      } else {
        for (const [key, value] of Object.entries(fields as Record<string, FieldValue>)) {
          checkFieldValue(defsByName.get(key), value, key, at, errors);
        }
      }
      const children = node.children ?? [];
      if (!Array.isArray(children)) {
        errors.push(`${at}: children must be an array`);
      } else if (children.length) {
        visit(children, depth + 1, `${at}.children`);
      }
    });
  };

  visit(nodes, 1, "items");
  return errors;
}
