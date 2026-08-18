/** Admin-side mirrors of the server contracts (server/src/{tree,fields,layouts}.ts). */

export type NavLink =
  | { kind: "internal"; uid: string; documentId: string; query?: string; hash?: string }
  | { kind: "external"; url: string }
  | { kind: "path"; path: string }
  | { kind: "none" };

export interface MediaRef {
  id: number;
  documentId: string;
  url?: string;
  alternativeText?: string;
}

export type FieldValue = string | number | boolean | { media: MediaRef };

export interface NavNode {
  id: string;
  title: string;
  link: NavLink;
  fields: Record<string, FieldValue>;
  hidden?: boolean;
  children: NavNode[];
}

export type FieldType = "string" | "text" | "boolean" | "select" | "media" | "url" | "number";

export interface FieldDef {
  name: string;
  type: FieldType;
  label: string;
  options?: string[];
  levels?: number[];
  disabled?: boolean;
  /** Absent falls back to the type: prose is translated, identifiers are not. */
  translatable?: boolean;
}

export interface FieldUse {
  field: string;
  zone: string;
  required?: boolean;
  hint?: string;
}

export interface LevelSpec {
  role: string;
  label: string;
  childrenAllowed: boolean;
  min?: number;
  max?: number;
  linkExpected?: boolean;
  fields: FieldUse[];
}

export interface LayoutSpec {
  key: string;
  label: string;
  recipe: string;
  levels: LevelSpec[];
  preview: { template: string; params: Record<string, unknown> };
}

export interface NavigationSummary {
  documentId: string;
  name: string;
  slug: string;
  visible: boolean;
  locales: Record<string, { hasDraft: boolean; hasPublished: boolean; updatedAt?: string }>;
}

export interface NavigationDoc {
  documentId: string;
  name: string;
  slug: string;
  visible: boolean;
  items: NavNode[] | null;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface EntryHit {
  documentId: string;
  title: string;
  href: string | null;
  published: boolean;
}

export interface ResolvedRef {
  uid: string;
  documentId: string;
  title?: string;
  href?: string | null;
  published?: boolean;
  missing: boolean;
}

export type CopyMode = "full" | "structure" | "translate";

export interface CopyResult {
  items: number;
  kept: number;
  translated?: number;
  untranslated?: number;
  /** Linked entries with no version in the target locale — they render as headings. */
  missingEntryTranslations?: { uid: string; documentId: string }[];
}

export interface SourceInfo {
  uid: string;
  titleField: string;
  pattern?: string;
  pathField?: string;
  known: boolean;
}

export interface HealthIssue {
  navigation: string;
  locale?: string;
  nodeId: string;
  title: string;
  kind: "broken-ref" | "missing-media" | "path-escape-hatch" | "unknown-field";
  detail: string;
}

/** Mirror of server/src/migration/run.ts. */
export interface MigrationLocaleReport {
  items: number;
  links: { internal: number; external: number; path: number; none: number };
  reverseMatched: number;
  pathFallbacks: string[];
  unknownFieldKeys: string[];
  booleansCoerced: number;
  mediaRelinked: number;
  mediaMissing: number;
  unpaired: number;
  menuDetachedRoots: string[];
}

export interface NavigationReport {
  slug: string;
  name: string;
  action: "create" | "overwrite" | "skip";
  locales: Record<string, MigrationLocaleReport>;
}

export interface MigrationReport {
  mode: "scan" | "run";
  ok: boolean;
  reason?: string;
  navigations: NavigationReport[];
  morphDuplicatesDeduped: number;
  warnings: string[];
}
