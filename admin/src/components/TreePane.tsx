import * as React from "react";
import { useIntl } from "react-intl";
import styled from "styled-components";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, Box, Flex, IconButton, Menu, Typography } from "@strapi/design-system";
import { CaretDown, Drag, More, Plus } from "@strapi/icons";
import { flattenTree, projectDrop, type FlatRow, type Projection } from "../editor/flatten";
import { emptyNode, subtreeDepth, type EditorAction } from "../editor/reducer";
import { getTranslation } from "../getTranslation";
import type { NavNode, ResolvedRef } from "../types";

const INDENT = 24;

const Row = styled(Flex)<{ $selected: boolean }>`
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  background: ${({ $selected, theme }) => ($selected ? theme.colors.primary100 : "transparent")};
  &:hover {
    background: ${({ $selected, theme }) =>
      $selected ? theme.colors.primary100 : theme.colors.neutral100};
  }
`;

const DropIndicator = styled.div<{ $depth: number; $invalid: boolean }>`
  height: 2px;
  margin-left: ${({ $depth }) => ($depth - 1) * INDENT + 28}px;
  background: ${({ $invalid, theme }) => ($invalid ? theme.colors.danger600 : theme.colors.primary600)};
  border-radius: 1px;
`;

interface IssueCounts {
  degrade: number;
  warning: number;
}

interface Props {
  tree: NavNode[];
  selectedId: string | null;
  maxDepth: number;
  brokenRefs: Set<string>;
  issuesByNode?: Map<string, IssueCounts>;
  dispatch: (action: EditorAction) => void;
}

interface RowItemProps {
  row: FlatRow;
  selected: boolean;
  broken: boolean;
  issueCounts?: IssueCounts;
  maxDepth: number;
  dispatch: (action: EditorAction) => void;
  onToggle: (id: string) => void;
}

const linkBadge = (node: NavNode): string | null => {
  switch (node.link.kind) {
    case "internal":
      return "→";
    case "external":
      return "↗";
    case "path":
      return "/…";
    default:
      return null;
  }
};

const RowItem = ({ row, selected, broken, issueCounts, maxDepth, dispatch, onToggle }: RowItemProps) => {
  const { formatMessage } = useIntl();
  const t = (id: string, defaultMessage: string) =>
    formatMessage({ id: getTranslation(id), defaultMessage });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const badge = linkBadge(row.node);

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition: transition ?? undefined,
        opacity: isDragging ? 0.4 : 1,
        marginLeft: (row.depth - 1) * INDENT,
      }}
    >
      <Row
        $selected={selected}
        gap={1}
        alignItems="center"
        onClick={() => dispatch({ type: "select", id: row.id })}
      >
        <IconButton
          label={t("tree.drag", "Move (space to lift, arrows to move)")}
          variant="ghost"
          size="XS"
          {...attributes}
          {...listeners}
        >
          <Drag />
        </IconButton>

        {row.hasChildren ? (
          <IconButton
            label={row.collapsed ? t("tree.expand", "Expand") : t("tree.collapse", "Collapse")}
            variant="ghost"
            size="XS"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onToggle(row.id);
            }}
          >
            <CaretDown
              style={{ transform: row.collapsed ? "rotate(-90deg)" : undefined, transition: "transform .15s" }}
            />
          </IconButton>
        ) : (
          <Box width="2.4rem" />
        )}

        <Typography
          fontWeight={row.depth === 1 ? "bold" : undefined}
          textColor={row.node.hidden ? "neutral500" : "neutral800"}
          style={{ flex: 1, textDecoration: row.node.hidden ? "line-through" : undefined }}
          ellipsis
        >
          {row.node.title || "—"}
        </Typography>

        {row.depth === 1 && typeof row.node.fields.presentation === "string" ? (
          <Badge size="S">{row.node.fields.presentation}</Badge>
        ) : null}
        {issueCounts && issueCounts.degrade + issueCounts.warning > 0 ? (
          <Badge
            size="S"
            backgroundColor={issueCounts.degrade ? "danger100" : "warning100"}
            textColor={issueCounts.degrade ? "danger700" : "warning700"}
            aria-label={t("tree.issues", "This item has problems")}
          >
            {issueCounts.degrade + issueCounts.warning}
          </Badge>
        ) : null}
        {badge ? (
          <Typography variant="pi" textColor={broken ? "danger600" : "neutral500"}>
            {broken ? "⚠" : badge}
          </Typography>
        ) : null}

        <IconButton
          label={t("tree.add-child", "Add a child")}
          variant="ghost"
          size="XS"
          disabled={row.depth >= maxDepth}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            dispatch({ type: "add-child", parentId: row.id, node: emptyNode(t("tree.new-item", "New item")) });
          }}
        >
          <Plus />
        </IconButton>

        <Menu.Root>
          <Menu.Trigger
            tag={IconButton}
            label={t("tree.actions", "Actions")}
            icon={<More />}
            variant="ghost"
            size="XS"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          />
          <Menu.Content>
            <Menu.Item onSelect={() => dispatch({ type: "add-sibling", siblingId: row.id, node: emptyNode(t("tree.new-item", "New item")), position: "above" })}>
              {t("tree.add-above", "Add above")}
            </Menu.Item>
            <Menu.Item onSelect={() => dispatch({ type: "add-sibling", siblingId: row.id, node: emptyNode(t("tree.new-item", "New item")), position: "below" })}>
              {t("tree.add-below", "Add below")}
            </Menu.Item>
            <Menu.Item onSelect={() => dispatch({ type: "duplicate", id: row.id })}>
              {t("tree.duplicate", "Duplicate (with children)")}
            </Menu.Item>
            <Menu.Item onSelect={() => dispatch({ type: "move", id: row.id, direction: "up" })}>
              {t("tree.move-up", "Move up")}
            </Menu.Item>
            <Menu.Item onSelect={() => dispatch({ type: "move", id: row.id, direction: "down" })}>
              {t("tree.move-down", "Move down")}
            </Menu.Item>
            <Menu.Item onSelect={() => dispatch({ type: "indent", id: row.id })}>
              {t("tree.indent", "Indent")}
            </Menu.Item>
            <Menu.Item onSelect={() => dispatch({ type: "outdent", id: row.id })}>
              {t("tree.outdent", "Outdent")}
            </Menu.Item>
            <Menu.Item
              variant="danger"
              onSelect={() => {
                const count = countSubtree(row.node);
                if (
                  count === 1 ||
                  window.confirm(
                    formatMessage(
                      { id: getTranslation("tree.confirm-delete"), defaultMessage: "Delete “{title}” and its {count} children?" },
                      { title: row.node.title, count: count - 1 },
                    ),
                  )
                ) {
                  dispatch({ type: "remove", id: row.id });
                }
              }}
            >
              {t("tree.delete", "Delete")}
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </Row>
    </Box>
  );
};

const countSubtree = (node: NavNode): number =>
  1 + node.children.reduce((sum, child) => sum + countSubtree(child), 0);

/**
 * Flattened sortable tree: rows indented by depth; a drag projects its target
 * depth from the pointer's x-offset, clamped to what the structure and
 * maxDepth allow — reorder and reparent in one gesture. Every operation is
 * also reachable from the row menu (the keyboard/a11y-complete path).
 */
const TreePane = ({ tree, selectedId, maxDepth, brokenRefs, issuesByNode, dispatch }: Props) => {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [drag, setDrag] = React.useState<{
    activeId: string;
    rows: FlatRow[];
    overId: string | null;
    projection: Projection | null;
    startDepth: number;
  } | null>(null);

  const rows = React.useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onToggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const active = rows.find((r) => r.id === activeId);
    if (!active) return;
    // The dragged subtree leaves the projection space.
    const excluded = new Set<string>();
    const mark = (node: NavNode) => {
      excluded.add(node.id);
      node.children.forEach(mark);
    };
    mark(active.node);
    setDrag({
      activeId,
      rows: rows.filter((r) => !excluded.has(r.id)),
      overId: null,
      projection: null,
      startDepth: active.depth,
    });
  };

  const handleMove = (event: DragMoveEvent) => {
    setDrag((current) => {
      if (!current) return current;
      const overId = event.over ? String(event.over.id) : null;
      if (!overId) return { ...current, overId: null, projection: null };
      const overIndex = current.rows.findIndex((r) => r.id === overId);
      if (overIndex < 0) return { ...current, overId: null, projection: null };
      const active = rows.find((r) => r.id === current.activeId);
      const pointerDepth = current.startDepth + Math.round(event.delta.x / INDENT);
      const projection = projectDrop(current.rows, overIndex, pointerDepth, {
        maxDepth,
        draggedDepthSpan: active ? subtreeDepth(active.node) : 1,
      });
      return { ...current, overId, projection };
    });
  };

  const handleEnd = (event: DragEndEvent) => {
    const current = drag;
    setDrag(null);
    if (!current?.projection || !event.over) return;
    dispatch({
      type: "relocate",
      id: current.activeId,
      parentId: current.projection.parentId,
      index: current.projection.index,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleStart}
      onDragMove={handleMove}
      onDragEnd={handleEnd}
      onDragCancel={() => setDrag(null)}
    >
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <Flex direction="column" alignItems="stretch" gap={0}>
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              {drag?.overId === row.id && drag.projection ? (
                <DropIndicator $depth={drag.projection.depth} $invalid={drag.projection.clamped} />
              ) : null}
              <RowItem
                row={row}
                selected={row.id === selectedId}
                broken={
                  row.node.link.kind === "internal" &&
                  brokenRefs.has(`${row.node.link.uid}:${row.node.link.documentId}`)
                }
                issueCounts={issuesByNode?.get(row.id)}
                maxDepth={maxDepth}
                dispatch={dispatch}
                onToggle={onToggle}
              />
            </React.Fragment>
          ))}
        </Flex>
      </SortableContext>
    </DndContext>
  );
};

export default TreePane;
