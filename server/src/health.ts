import type { Core } from "@strapi/strapi";
import { getFieldDefs } from "./fields";
import { resolveRefs } from "./sources";
import { walk, type MediaRef, type NavNode } from "./tree";
import { NAVIGATION_UID } from "./i18n";

/**
 * The dashboard behind "true internal links": references stored in JSON have
 * no FK, so drift (deleted entries, removed uploads, hand-typed paths, legacy
 * field keys) must be SURFACED instead of silently 404ing on the site.
 */

export interface HealthIssue {
  navigation: string;
  locale?: string;
  nodeId: string;
  title: string;
  kind: "broken-ref" | "missing-media" | "path-escape-hatch" | "unknown-field";
  detail: string;
}

export async function runHealthCheck(strapi: Core.Strapi): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];
  const fieldNames = new Set((await getFieldDefs(strapi)).map((d) => d.name));

  const rows = (await strapi.db.query(NAVIGATION_UID).findMany({
    where: { publishedAt: null }, // drafts = the working copies
    select: ["documentId", "slug", "locale", "items"],
  })) as { documentId: string; slug: string; locale?: string; items?: NavNode[] }[];

  const mediaIds = new Set<number>();
  const refs: { uid: string; documentId: string }[] = [];
  const refIndex: { row: (typeof rows)[number]; node: NavNode }[] = [];

  for (const row of rows) {
    walk(row.items ?? [], (node) => {
      if (node.link?.kind === "internal") {
        refs.push({ uid: node.link.uid, documentId: node.link.documentId });
        refIndex.push({ row, node });
      }
      if (node.link?.kind === "path") {
        issues.push({
          navigation: row.slug,
          locale: row.locale,
          nodeId: node.id,
          title: node.title,
          kind: "path-escape-hatch",
          detail: node.link.path,
        });
      }
      for (const [key, value] of Object.entries(node.fields ?? {})) {
        if (!fieldNames.has(key)) {
          issues.push({
            navigation: row.slug,
            locale: row.locale,
            nodeId: node.id,
            title: node.title,
            kind: "unknown-field",
            detail: key,
          });
        }
        const media = (value as { media?: MediaRef })?.media;
        if (media?.id) mediaIds.add(media.id);
      }
    });
  }

  const resolved = await resolveRefs(strapi, refs);
  const missing = new Set(
    resolved.filter((r) => r.missing).map((r) => `${r.uid}:${r.documentId}`),
  );
  for (const { row, node } of refIndex) {
    const link = node.link as { uid: string; documentId: string };
    if (missing.has(`${link.uid}:${link.documentId}`)) {
      issues.push({
        navigation: row.slug,
        locale: row.locale,
        nodeId: node.id,
        title: node.title,
        kind: "broken-ref",
        detail: `${link.uid} ${link.documentId}`,
      });
    }
  }

  if (mediaIds.size) {
    const found = new Set(
      (
        (await strapi.db
          .query("plugin::upload.file")
          .findMany({ where: { id: { $in: [...mediaIds] } }, select: ["id"] })) as { id: number }[]
      ).map((f) => f.id),
    );
    for (const row of rows) {
      walk(row.items ?? [], (node) => {
        for (const value of Object.values(node.fields ?? {})) {
          const media = (value as { media?: MediaRef })?.media;
          if (media?.id && !found.has(media.id)) {
            issues.push({
              navigation: row.slug,
              locale: row.locale,
              nodeId: node.id,
              title: node.title,
              kind: "missing-media",
              detail: `file ${media.id}`,
            });
          }
        }
      });
    }
  }

  return issues;
}
