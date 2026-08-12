import type { LayoutSpec, NavNode } from "../types";

/**
 * The anti-silent-degradation system. The reference front degrades a grouped
 * layout (level 2 without children) to `simple` with no feedback; this lint
 * mirrors that decision so the editor sees it BEFORE the site does, plus the
 * structural expectations each layout declares (min/max children, expected
 * links, required fields, depth budget).
 */

export type IssueSeverity = "degrade" | "warning";

export interface LintIssue {
  severity: IssueSeverity;
  nodeId: string;
  nodeTitle: string;
  code:
    | "will-degrade"
    | "missing-required-field"
    | "too-few-children"
    | "too-many-children"
    | "link-expected"
    | "too-deep"
    | "broken-ref";
  /** Interpolation values for the message. */
  values: Record<string, string | number>;
}

/** Mirrors the front's GROUPED set: layouts whose level 2 must have children. */
export const isGroupedLayout = (spec: LayoutSpec): boolean => spec.levels.length >= 3;

export function lintSubtree(
  root: NavNode,
  spec: LayoutSpec | null,
  { brokenRefs = new Set<string>() }: { brokenRefs?: Set<string> } = {},
): LintIssue[] {
  const issues: LintIssue[] = [];

  const checkBroken = (node: NavNode) => {
    if (
      node.link.kind === "internal" &&
      brokenRefs.has(`${node.link.uid}:${node.link.documentId}`)
    ) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        nodeTitle: node.title,
        code: "broken-ref",
        values: {},
      });
    }
    node.children.forEach(checkBroken);
  };
  checkBroken(root);

  if (!spec) return issues;

  // The front's exact fallback rule: a grouped layout picked on a flat tree
  // (no level-2 item has children) renders as `simple`.
  if (isGroupedLayout(spec) && !root.children.some((child) => child.children.length > 0)) {
    issues.push({
      severity: "degrade",
      nodeId: root.id,
      nodeTitle: root.title,
      code: "will-degrade",
      values: { layout: spec.label },
    });
  }

  const visit = (node: NavNode, depth: number) => {
    const level = spec.levels[Math.min(depth, spec.levels.length) - 1];

    if (depth > spec.levels.length) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        nodeTitle: node.title,
        code: "too-deep",
        values: { layout: spec.label, max: spec.levels.length },
      });
      return; // deeper issues would just repeat
    }

    if (level) {
      for (const use of level.fields) {
        if (use.required && node.fields[use.field] === undefined) {
          issues.push({
            severity: "warning",
            nodeId: node.id,
            nodeTitle: node.title,
            code: "missing-required-field",
            values: { field: use.field },
          });
        }
      }
      if (level.linkExpected && node.link.kind === "none") {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          nodeTitle: node.title,
          code: "link-expected",
          values: { level: level.label },
        });
      }
      const childLevel = spec.levels[depth]; // spec for the children
      if (childLevel?.min !== undefined && node.children.length < childLevel.min) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          nodeTitle: node.title,
          code: "too-few-children",
          values: { min: childLevel.min, count: node.children.length, level: childLevel.label },
        });
      }
      if (childLevel?.max !== undefined && node.children.length > childLevel.max) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          nodeTitle: node.title,
          code: "too-many-children",
          values: { max: childLevel.max, count: node.children.length, level: childLevel.label },
        });
      }
    }

    node.children.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 1);

  return issues;
}
