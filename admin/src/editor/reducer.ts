import type { FieldValue, NavLink, NavNode } from "../types";

/**
 * The editor's working copy: the whole tree is ONE value, so every mutation
 * is a pure function old-tree → new-tree, dirty tracking is a boolean, and
 * undo/redo are snapshots — the payoff of the atomic-tree storage model.
 */

export interface EditorState {
  tree: NavNode[];
  selectedId: string | null;
  dirty: boolean;
  past: NavNode[][];
  future: NavNode[][];
}

const MAX_UNDO = 50;

export const newNodeId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export const emptyNode = (title: string): NavNode => ({
  id: newNodeId(),
  title,
  link: { kind: "none" },
  fields: {},
  children: [],
});

export type EditorAction =
  | { type: "load"; tree: NavNode[] }
  | { type: "select"; id: string | null }
  | { type: "add-child"; parentId: string | null; node: NavNode }
  | { type: "add-sibling"; siblingId: string; node: NavNode; position: "above" | "below" }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "rename"; id: string; title: string }
  | { type: "set-link"; id: string; link: NavLink }
  | { type: "set-field"; id: string; name: string; value: FieldValue | undefined }
  | { type: "set-hidden"; id: string; hidden: boolean }
  | { type: "move"; id: string; direction: "up" | "down" }
  | { type: "indent"; id: string }
  | { type: "outdent"; id: string }
  | { type: "relocate"; id: string; parentId: string | null; index: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "mark-saved" };

const clone = (tree: NavNode[]): NavNode[] => JSON.parse(JSON.stringify(tree)) as NavNode[];

interface Located {
  node: NavNode;
  siblings: NavNode[];
  index: number;
  parent: NavNode | null;
}

function locate(tree: NavNode[], id: string, parent: NavNode | null = null): Located | null {
  const siblings = parent ? parent.children : tree;
  for (let index = 0; index < siblings.length; index += 1) {
    const node = siblings[index];
    if (node.id === id) return { node, siblings, index, parent };
    const found = locate(tree, id, node);
    if (found) return found;
  }
  return null;
}

export function findNode(tree: NavNode[], id: string | null): NavNode | null {
  if (!id) return null;
  return locate(tree, id)?.node ?? null;
}

export function nodeDepth(tree: NavNode[], id: string): number {
  const search = (nodes: NavNode[], depth: number): number => {
    for (const node of nodes) {
      if (node.id === id) return depth;
      const found = search(node.children, depth + 1);
      if (found) return found;
    }
    return 0;
  };
  return search(tree, 1);
}

export function subtreeDepth(node: NavNode): number {
  if (!node.children.length) return 1;
  return 1 + Math.max(...node.children.map(subtreeDepth));
}

const reId = (node: NavNode): NavNode => ({
  ...node,
  id: newNodeId(),
  children: node.children.map(reId),
});

/**
 * Save-time normalization: an internal link whose entry was never picked is an
 * unfinished edit, not a target. The editor keeps it as `internal` so the form
 * stays on its tab; the server only ever sees a complete link or a wrapper.
 */
export function normalizeForSave(tree: NavNode[]): NavNode[] {
  return tree.map((node) => ({
    ...node,
    link:
      node.link.kind === "internal" && !node.link.documentId
        ? { kind: "none" as const }
        : node.link,
    children: normalizeForSave(node.children),
  }));
}

/** Tree-only transformation; returns null when the action is a no-op. */
function mutate(tree: NavNode[], action: EditorAction, maxDepth: number): NavNode[] | null {
  const next = clone(tree);
  switch (action.type) {
    case "add-child": {
      if (action.parentId === null) {
        next.push(action.node);
        return next;
      }
      const parent = locate(next, action.parentId);
      if (!parent) return null;
      if (nodeDepth(next, action.parentId) + 1 > maxDepth) return null;
      parent.node.children.push(action.node);
      return next;
    }
    case "add-sibling": {
      const at = locate(next, action.siblingId);
      if (!at) return null;
      at.siblings.splice(at.index + (action.position === "below" ? 1 : 0), 0, action.node);
      return next;
    }
    case "remove": {
      const at = locate(next, action.id);
      if (!at) return null;
      at.siblings.splice(at.index, 1);
      return next;
    }
    case "duplicate": {
      const at = locate(next, action.id);
      if (!at) return null;
      at.siblings.splice(at.index + 1, 0, reId(at.node));
      return next;
    }
    case "rename": {
      const at = locate(next, action.id);
      if (!at) return null;
      at.node.title = action.title;
      return next;
    }
    case "set-link": {
      const at = locate(next, action.id);
      if (!at) return null;
      at.node.link = action.link;
      return next;
    }
    case "set-field": {
      const at = locate(next, action.id);
      if (!at) return null;
      if (action.value === undefined) delete at.node.fields[action.name];
      else at.node.fields[action.name] = action.value;
      return next;
    }
    case "set-hidden": {
      const at = locate(next, action.id);
      if (!at) return null;
      at.node.hidden = action.hidden || undefined;
      return next;
    }
    case "move": {
      const at = locate(next, action.id);
      if (!at) return null;
      const to = at.index + (action.direction === "up" ? -1 : 1);
      if (to < 0 || to >= at.siblings.length) return null;
      at.siblings.splice(at.index, 1);
      at.siblings.splice(to, 0, at.node);
      return next;
    }
    case "indent": {
      // Become the last child of the previous sibling.
      const at = locate(next, action.id);
      if (!at || at.index === 0) return null;
      const newParent = at.siblings[at.index - 1];
      const depth = nodeDepth(next, newParent.id);
      if (depth + subtreeDepth(at.node) > maxDepth) return null;
      at.siblings.splice(at.index, 1);
      newParent.children.push(at.node);
      return next;
    }
    case "outdent": {
      // Become the next sibling of the parent.
      const at = locate(next, action.id);
      if (!at?.parent) return null;
      const parentAt = locate(next, at.parent.id);
      if (!parentAt) return null;
      at.siblings.splice(at.index, 1);
      parentAt.siblings.splice(parentAt.index + 1, 0, at.node);
      return next;
    }
    case "relocate": {
      // DnD drop: move the subtree under parentId at index.
      const at = locate(next, action.id);
      if (!at) return null;
      // Refuse dropping into own descendants.
      if (action.parentId && (action.parentId === action.id || locate([at.node], action.parentId))) {
        return null;
      }
      const targetDepth = action.parentId ? nodeDepth(next, action.parentId) + 1 : 1;
      if (targetDepth - 1 + subtreeDepth(at.node) > maxDepth) return null;
      at.siblings.splice(at.index, 1);
      const target = action.parentId ? locate(next, action.parentId)?.node.children : next;
      if (!target) return null;
      target.splice(Math.min(Math.max(action.index, 0), target.length), 0, at.node);
      return next;
    }
    default:
      return null;
  }
}

export function editorReducer(maxDepth: number) {
  return (state: EditorState, action: EditorAction): EditorState => {
    switch (action.type) {
      case "load":
        return { tree: action.tree, selectedId: null, dirty: false, past: [], future: [] };
      case "select":
        return { ...state, selectedId: action.id };
      case "mark-saved":
        return { ...state, dirty: false };
      case "undo": {
        const previous = state.past[state.past.length - 1];
        if (!previous) return state;
        return {
          ...state,
          tree: previous,
          past: state.past.slice(0, -1),
          future: [state.tree, ...state.future],
          dirty: true,
        };
      }
      case "redo": {
        const [nextTree, ...rest] = state.future;
        if (!nextTree) return state;
        return { ...state, tree: nextTree, past: [...state.past, state.tree], future: rest, dirty: true };
      }
      default: {
        const nextTree = mutate(state.tree, action, maxDepth);
        if (!nextTree) return state;
        const selectedId =
          action.type === "remove" && state.selectedId === action.id
            ? null
            : "node" in action && action.type.startsWith("add")
              ? (action as { node: NavNode }).node.id
              : state.selectedId;
        return {
          tree: nextTree,
          selectedId,
          dirty: true,
          past: [...state.past.slice(-(MAX_UNDO - 1)), state.tree],
          future: [],
        };
      }
    }
  };
}
