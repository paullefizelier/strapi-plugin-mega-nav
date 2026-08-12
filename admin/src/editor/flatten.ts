import type { NavNode } from "../types";

/**
 * The flattened-sortable-tree model: the subtree renders as a flat list of
 * rows indented by depth; during a drag the pointer's horizontal offset
 * projects the target depth between what the previous row allows and what the
 * layout permits. One gesture gives reorder AND reparent.
 */

export interface FlatRow {
  id: string;
  node: NavNode;
  depth: number; // 1-based
  parentId: string | null;
  /** Index among its siblings. */
  index: number;
  collapsed?: boolean;
  hasChildren: boolean;
}

export function flattenTree(
  nodes: NavNode[],
  collapsedIds: Set<string>,
  depth = 1,
  parentId: string | null = null,
): FlatRow[] {
  const rows: FlatRow[] = [];
  nodes.forEach((node, index) => {
    const collapsed = collapsedIds.has(node.id);
    rows.push({
      id: node.id,
      node,
      depth,
      parentId,
      index,
      collapsed,
      hasChildren: node.children.length > 0,
    });
    if (!collapsed) rows.push(...flattenTree(node.children, collapsedIds, depth + 1, node.id));
  });
  return rows;
}

export interface Projection {
  depth: number;
  parentId: string | null;
  /** Insertion index among the new parent's children, computed WITHOUT the dragged subtree. */
  index: number;
  /** True when the pointer pushed beyond what the layout allows (clamped). */
  clamped: boolean;
}

/**
 * Where would the dragged row land if dropped now?
 *
 * `rows` must be the flattened list WITHOUT the dragged subtree, `overIndex`
 * the insertion position in that list, `pointerDepth` the depth the pointer's
 * x-offset suggests.
 */
export function projectDrop(
  rows: FlatRow[],
  overIndex: number,
  pointerDepth: number,
  { maxDepth, draggedDepthSpan }: { maxDepth: number; draggedDepthSpan: number },
): Projection {
  const previous = rows[overIndex - 1];
  const next = rows[overIndex];

  // Legal depth window: as deep as "child of the previous row", as shallow as
  // the depth of the next row (you cannot outdent past what follows without
  // breaking its parent chain).
  const maxByPrevious = previous ? previous.depth + 1 : 1;
  const minByNext = next ? next.depth : 1;
  const maxByLayout = maxDepth - draggedDepthSpan + 1;

  const upper = Math.min(maxByPrevious, maxByLayout);
  const lower = Math.min(minByNext, upper);
  const depth = Math.max(lower, Math.min(pointerDepth, upper));
  const clamped = pointerDepth > upper || pointerDepth < lower;

  // Walk back to find the parent: the nearest previous row one level up.
  let parentId: string | null = null;
  for (let i = overIndex - 1; i >= 0; i -= 1) {
    if (rows[i].depth === depth - 1) {
      parentId = rows[i].id;
      break;
    }
    if (rows[i].depth < depth - 1) break;
  }

  // Insertion index among the target parent's children = how many previous
  // rows share that parent at that depth.
  let index = 0;
  for (let i = 0; i < overIndex; i += 1) {
    if (rows[i].depth === depth && rows[i].parentId === parentId) index += 1;
  }
  // Rows moved under a NEW parent during this projection have stale parentIds;
  // recount against depth alone within the parent's span.
  if (parentId !== null) {
    index = 0;
    let inSpan = false;
    for (let i = 0; i < overIndex; i += 1) {
      if (rows[i].id === parentId) {
        inSpan = true;
        continue;
      }
      if (!inSpan) continue;
      if (rows[i].depth <= depth - 1) break;
      if (rows[i].depth === depth) index += 1;
    }
  }

  return { depth, parentId, index, clamped };
}
