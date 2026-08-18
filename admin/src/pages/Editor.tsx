import * as React from "react";
import { useIntl } from "react-intl";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Divider,
  EmptyStateLayout,
  Flex,
  IconButton,
  Loader,
  Modal,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from "@strapi/design-system";
import { ArrowClockwise, Plus } from "@strapi/icons";
import { useNotification } from "@strapi/strapi/admin";
import { useMegaNavApi } from "../api";
import { lintSubtree, type LintIssue } from "../editor/lint";
import {
  editorReducer,
  emptyNode,
  findNode,
  nodeDepth,
  normalizeForSave,
  type EditorState,
} from "../editor/reducer";
import ItemPanel from "../components/ItemPanel";
import Preview from "../components/Preview";
import TreePane from "../components/TreePane";
import { getTranslation } from "../getTranslation";
import type {
  CopyMode,
  FieldDef,
  LayoutSpec,
  NavigationDoc,
  NavigationSummary,
  NavNode,
  ResolvedRef,
  SourceInfo,
} from "../types";

const MAX_DEPTH = 4;

const initialState: EditorState = { tree: [], selectedId: null, dirty: false, past: [], future: [] };

/**
 * The editor: one page for the whole plugin. Navigation + locale switchers,
 * the DnD tree on the left, the schema-driven item panel on the right. The
 * working copy lives in a reducer over the atomic tree — save PUTs the whole
 * value with optimistic concurrency, publish is a separate explicit step.
 */
const Editor = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const api = useMegaNavApi();

  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [navigations, setNavigations] = React.useState<NavigationSummary[] | null>(null);
  const [documentId, setDocumentId] = React.useState<string>("");
  const [locale, setLocale] = React.useState<string>("");
  const [doc, setDoc] = React.useState<NavigationDoc | null>(null);
  const [fieldDefs, setFieldDefs] = React.useState<FieldDef[]>([]);
  const [layouts, setLayouts] = React.useState<LayoutSpec[]>([]);
  const [sources, setSources] = React.useState<SourceInfo[]>([]);
  const [resolvedRefs, setResolvedRefs] = React.useState<Map<string, ResolvedRef>>(new Map());
  const [aiConfigured, setAiConfigured] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [copyOpen, setCopyOpen] = React.useState(false);

  const reducer = React.useMemo(() => editorReducer(MAX_DEPTH), []);
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const load = React.useCallback(async () => {
    const [navs, defs, specs, srcs, ai] = await Promise.all([
      api.listNavigations(),
      api.getFields(),
      api.getLayouts(),
      api.getSources(),
      // Not fatal: without it the translate option is simply offered as
      // unavailable rather than failing once clicked.
      api.getAi().catch(() => ({ configured: false, provider: "", model: "" })),
    ]);
    setNavigations(navs);
    setFieldDefs(defs);
    setLayouts(specs);
    setSources(srcs.filter((s) => s.known));
    setAiConfigured(ai.configured);
    return navs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    load()
      .then((navs) => {
        const first = navs[0];
        if (first) {
          setDocumentId(first.documentId);
          setLocale(Object.keys(first.locales)[0] ?? "en");
        }
      })
      .catch(() =>
        toggleNotification({ type: "danger", message: t("editor.load-error", "Could not load the navigations.") }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRefs = React.useCallback(
    async (tree: NavNode[], loc: string) => {
      const refs: { uid: string; documentId: string }[] = [];
      const collect = (nodes: NavNode[]) => {
        for (const node of nodes) {
          if (node.link.kind === "internal" && node.link.documentId) {
            refs.push({ uid: node.link.uid, documentId: node.link.documentId });
          }
          collect(node.children);
        }
      };
      collect(tree);
      try {
        const resolved = await api.resolveRefs(refs, loc);
        setResolvedRefs(new Map(resolved.map((r) => [`${r.uid}:${r.documentId}`, r])));
      } catch {
        setResolvedRefs(new Map());
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadDoc = React.useCallback(
    async (docId: string, loc: string) => {
      if (!docId || !loc) return;
      setBusy(true);
      try {
        const next = await api.getNavigation(docId, loc);
        setDoc(next);
        const tree = (next.items ?? []) as NavNode[];
        dispatch({ type: "load", tree });
        void refreshRefs(tree, loc);
      } catch {
        // No variant in this locale yet — start empty.
        setDoc(null);
        dispatch({ type: "load", tree: [] });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshRefs],
  );

  React.useEffect(() => {
    void loadDoc(documentId, locale);
  }, [documentId, locale, loadDoc]);

  React.useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (state.dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.dirty]);

  const current = navigations?.find((n) => n.documentId === documentId) ?? null;
  const locales = React.useMemo(() => {
    const set = new Set<string>();
    for (const nav of navigations ?? []) for (const l of Object.keys(nav.locales)) set.add(l);
    if (locale) set.add(locale);
    return [...set];
  }, [navigations, locale]);

  const selected = findNode(state.tree, state.selectedId);
  const selectedDepth = state.selectedId ? nodeDepth(state.tree, state.selectedId) : 0;

  /** The level-1 ancestor of the selection (or the first root). */
  const activeRoot = React.useMemo(() => {
    const contains = (node: NavNode): boolean =>
      node.id === state.selectedId || node.children.some(contains);
    return (state.selectedId ? state.tree.find(contains) : undefined) ?? state.tree[0] ?? null;
  }, [state.tree, state.selectedId]);

  const layoutOf = React.useCallback(
    (root: NavNode | null) => {
      const key = root && typeof root.fields.presentation === "string" ? root.fields.presentation : null;
      return layouts.find((l) => l.key === key) ?? null;
    },
    [layouts],
  );
  const governingLayout = layoutOf(activeRoot);

  const brokenRefs = React.useMemo(
    () => new Set([...resolvedRefs.values()].filter((r) => r.missing).map((r) => `${r.uid}:${r.documentId}`)),
    [resolvedRefs],
  );

  const issues = React.useMemo(() => {
    const all: LintIssue[] = [];
    for (const root of state.tree) {
      all.push(...lintSubtree(root, layoutOf(root), { brokenRefs }));
    }
    return all;
  }, [state.tree, layoutOf, brokenRefs]);

  const issuesByNode = React.useMemo(() => {
    const map = new Map<string, { degrade: number; warning: number }>();
    for (const issue of issues) {
      const entry = map.get(issue.nodeId) ?? { degrade: 0, warning: 0 };
      entry[issue.severity] += 1;
      map.set(issue.nodeId, entry);
    }
    return map;
  }, [issues]);

  // Field ↔ preview-zone cross-highlighting: hovering a field in the panel
  // lights up the zones it feeds; hovering a preview zone lights up its field.
  const [hoveredField, setHoveredField] = React.useState<string | null>(null);
  const [hoveredZone, setHoveredZone] = React.useState<string | null>(null);
  const highlightZones = React.useMemo(() => {
    const zones = new Set<string>();
    if (hoveredField && governingLayout) {
      for (const level of governingLayout.levels) {
        for (const use of level.fields) {
          if (use.field === hoveredField) zones.add(use.zone);
        }
      }
    }
    return zones;
  }, [hoveredField, governingLayout]);

  const issueText = (issue: LintIssue): string => {
    switch (issue.code) {
      case "will-degrade":
        return t("issue.will-degrade", "“{title}” will render as “simple” — “{layout}” needs level-2 groups.", { title: issue.nodeTitle, ...issue.values });
      case "missing-required-field":
        return t("issue.missing-field", "“{title}”: field “{field}” is expected here.", { title: issue.nodeTitle, ...issue.values });
      case "too-few-children":
        return t("issue.too-few", "“{title}”: at least {min} children expected ({count}).", { title: issue.nodeTitle, ...issue.values });
      case "too-many-children":
        return t("issue.too-many", "“{title}”: at most {max} children expected ({count}).", { title: issue.nodeTitle, ...issue.values });
      case "link-expected":
        return t("issue.link-expected", "“{title}” should be a link at this level.", { title: issue.nodeTitle, ...issue.values });
      case "too-deep":
        return t("issue.too-deep", "“{title}” is deeper than “{layout}” renders ({max} levels).", { title: issue.nodeTitle, ...issue.values });
      case "broken-ref":
        return t("issue.broken-ref", "“{title}”: its internal link target no longer exists.", { title: issue.nodeTitle });
      default:
        return issue.code;
    }
  };

  const save = async ({ force = false } = {}) => {
    if (!documentId || !locale) return;
    setBusy(true);
    try {
      const saved = await api.saveNavigation(documentId, locale, {
        items: normalizeForSave(state.tree),
        ...(force || !doc ? {} : { updatedAt: doc.updatedAt }),
      });
      setDoc(saved);
      dispatch({ type: "mark-saved" });
      setConflict(false);
      void refreshRefs(state.tree, locale);
      toggleNotification({ type: "success", message: t("editor.saved", "Navigation saved.") });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) setConflict(true);
      else toggleNotification({ type: "danger", message: t("editor.save-error", "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!documentId || !locale) return;
    setBusy(true);
    try {
      await api.publishNavigation(documentId, locale);
      toggleNotification({ type: "success", message: t("editor.published", "Navigation published.") });
      const navs = await api.listNavigations();
      setNavigations(navs);
    } catch {
      toggleNotification({ type: "danger", message: t("editor.publish-error", "Could not publish.") });
    } finally {
      setBusy(false);
    }
  };

  if (!navigations) {
    return (
      <Box padding={8}>
        <Loader>{t("editor.loading", "Loading…")}</Loader>
      </Box>
    );
  }

  return (
    <Box padding={6} background="neutral100" minHeight="100vh">
      <Flex direction="column" alignItems="stretch" gap={4}>
        <Flex gap={2} alignItems="center" wrap="wrap">
          <Typography variant="alpha" tag="h1">
            {t("editor.title", "Navigation")}
          </Typography>
          <Box minWidth="20rem">
            <SingleSelect
              value={documentId}
              onChange={(next: string | number) => {
                if (state.dirty && !window.confirm(t("editor.unsaved", "Discard unsaved changes?"))) return;
                setDocumentId(String(next));
              }}
            >
              {navigations.map((nav) => (
                <SingleSelectOption key={nav.documentId} value={nav.documentId}>
                  {`${nav.name} (${nav.slug})`}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Box>
          <Box minWidth="8rem">
            <SingleSelect
              value={locale}
              onChange={(next: string | number) => {
                if (state.dirty && !window.confirm(t("editor.unsaved", "Discard unsaved changes?"))) return;
                setLocale(String(next));
              }}
            >
              {locales.map((l) => (
                <SingleSelectOption key={l} value={l}>
                  {l}
                  {current?.locales[l]?.hasPublished ? " ✓" : current?.locales[l]?.hasDraft ? " ●" : " ○"}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Box>
          <IconButton label={t("editor.new", "New navigation")} onClick={() => setCreateOpen(true)}>
            <Plus />
          </IconButton>
          <IconButton
            label={t("editor.reload", "Reload")}
            onClick={() => void loadDoc(documentId, locale)}
            disabled={busy}
          >
            <ArrowClockwise />
          </IconButton>

          <Flex gap={2} marginLeft="auto">
            <Button variant="tertiary" onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length}>
              {t("editor.undo", "Undo")}
            </Button>
            <Button variant="tertiary" onClick={() => dispatch({ type: "redo" })} disabled={!state.future.length}>
              {t("editor.redo", "Redo")}
            </Button>
            <Button variant="secondary" onClick={() => setCopyOpen(true)} disabled={!documentId}>
              {t("editor.copy-locale", "Copy from locale…")}
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!state.dirty}>
              {t("editor.save", "Save")}
            </Button>
            <Button variant="success" onClick={() => void publish()} disabled={busy || state.dirty}>
              {t("editor.publish", "Publish")}
            </Button>
          </Flex>
        </Flex>

        <Divider />

        {navigations.length === 0 ? (
          <EmptyStateLayout
            content={t("editor.empty", "No navigation yet — create one, or import from strapi-plugin-navigation in Settings.")}
            action={
              <Button startIcon={<Plus />} onClick={() => setCreateOpen(true)}>
                {t("editor.new", "New navigation")}
              </Button>
            }
          />
        ) : (
          <Flex direction="column" alignItems="stretch" gap={4}>
            {issues.length ? (
              <Box background="neutral0" hasRadius padding={4} shadow="tableShadow">
                <Flex direction="column" alignItems="stretch" gap={2}>
                  <Typography variant="sigma" textColor="neutral600">
                    {t("issues.title", "Problems ({count})", { count: issues.length })}
                  </Typography>
                  {issues.slice(0, 8).map((issue, index) => (
                    <Typography
                      key={`${issue.nodeId}-${issue.code}-${index}`}
                      variant="pi"
                      textColor={issue.severity === "degrade" ? "danger600" : "warning600"}
                      style={{ cursor: "pointer" }}
                      onClick={() => dispatch({ type: "select", id: issue.nodeId })}
                    >
                      {issueText(issue)}
                    </Typography>
                  ))}
                  {issues.length > 8 ? (
                    <Typography variant="pi" textColor="neutral500">
                      {t("issues.more", "…and {count} more", { count: issues.length - 8 })}
                    </Typography>
                  ) : null}
                </Flex>
              </Box>
            ) : null}

            {activeRoot ? (
              <Box background="neutral0" hasRadius padding={4} shadow="tableShadow">
                <Preview
                  root={activeRoot}
                  spec={governingLayout}
                  selectedId={state.selectedId}
                  onSelect={(id) => dispatch({ type: "select", id })}
                  highlightZones={highlightZones}
                  onZoneHover={setHoveredZone}
                />
              </Box>
            ) : null}

            <Flex gap={4} alignItems="flex-start">
            <Box flex="1" background="neutral0" hasRadius padding={4} shadow="tableShadow">
              <Flex direction="column" alignItems="stretch" gap={2}>
                <Flex gap={2}>
                  <Button
                    variant="tertiary"
                    size="S"
                    startIcon={<Plus />}
                    onClick={() =>
                      dispatch({ type: "add-child", parentId: null, node: emptyNode(t("tree.new-item", "New item")) })
                    }
                  >
                    {t("editor.add-root", "Add a menu item")}
                  </Button>
                </Flex>
                <TreePane
                  tree={state.tree}
                  selectedId={state.selectedId}
                  maxDepth={MAX_DEPTH}
                  brokenRefs={brokenRefs}
                  issuesByNode={issuesByNode}
                  dispatch={dispatch}
                />
              </Flex>
            </Box>

            <Box width="36rem" background="neutral0" hasRadius padding={4} shadow="tableShadow">
              {selected ? (
                <ItemPanel
                  node={selected}
                  depth={selectedDepth}
                  layout={governingLayout}
                  layouts={layouts}
                  fieldDefs={fieldDefs}
                  sources={sources}
                  locale={locale}
                  resolvedRefs={resolvedRefs}
                  hoveredZone={hoveredZone}
                  onFieldHover={setHoveredField}
                  dispatch={dispatch}
                />
              ) : (
                <Typography textColor="neutral600">
                  {t("editor.select-item", "Select an item to edit it.")}
                </Typography>
              )}
            </Box>
            </Flex>
          </Flex>
        )}
      </Flex>

      <Dialog.Root open={conflict} onOpenChange={setConflict}>
        <Dialog.Content>
          <Dialog.Header>{t("editor.conflict", "Modified by someone else")}</Dialog.Header>
          <Dialog.Body>
            {t(
              "editor.conflict-body",
              "This navigation changed since you loaded it. Reload to take their version (your changes are lost), or overwrite with yours.",
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Cancel>
              <Button variant="tertiary" onClick={() => void loadDoc(documentId, locale)}>
                {t("editor.conflict-reload", "Reload")}
              </Button>
            </Dialog.Cancel>
            <Dialog.Action>
              <Button variant="danger" onClick={() => void save({ force: true })}>
                {t("editor.conflict-overwrite", "Overwrite")}
              </Button>
            </Dialog.Action>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>

      <CreateNavigationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async (created) => {
          setCreateOpen(false);
          const navs = await api.listNavigations();
          setNavigations(navs);
          setDocumentId(created.documentId);
        }}
      />

      <CopyLocaleModal
        open={copyOpen}
        locales={locales}
        target={locale}
        aiConfigured={aiConfigured}
        onClose={() => setCopyOpen(false)}
        onCopy={async (from, mode, overwrite) => {
          setCopyOpen(false);
          setBusy(true);
          try {
            const result = await api.copyLocale(documentId, { from, to: locale, mode, overwrite });
            toggleNotification({
              type: "success",
              message:
                result.translated === undefined
                  ? t("editor.copied", "{items} items copied.", { items: result.items })
                  : t("editor.copied-translated", "{items} items · {translated} labels translated, {kept} kept.", {
                      items: result.items,
                      translated: result.translated,
                      kept: result.kept,
                    }),
            });
            // The answer can be partial, and a linked entry may simply not
            // exist in this locale — both would otherwise be discovered live.
            if (result.untranslated) {
              toggleNotification({
                type: "warning",
                message: t("editor.copy-untranslated", "{count} labels came back unusable and kept their source text.", {
                  count: result.untranslated,
                }),
              });
            }
            if (result.missingEntryTranslations?.length) {
              toggleNotification({
                type: "warning",
                message: t(
                  "editor.copy-missing-entries",
                  "{count} linked entries have no “{locale}” version — those items will render as plain headings.",
                  { count: result.missingEntryTranslations.length, locale },
                ),
              });
            }
            await loadDoc(documentId, locale);
          } catch {
            toggleNotification({ type: "danger", message: t("editor.copy-error", "Copy failed.") });
          } finally {
            setBusy(false);
          }
        }}
      />
    </Box>
  );
};

const CreateNavigationModal = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (doc: { documentId: string }) => void;
}) => {
  const { formatMessage } = useIntl();
  const api = useMegaNavApi();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const t = (id: string, defaultMessage: string) =>
    formatMessage({ id: getTranslation(id), defaultMessage });

  return (
    <Modal.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Typography variant="beta">{t("editor.new", "New navigation")}</Typography>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <TextInput
              placeholder={t("editor.new-name", "Name (e.g. Main navigation)")}
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setName(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[̀-ͯ]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
              }}
            />
            <TextInput
              placeholder="slug"
              value={slug}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)}
            />
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {t("editor.cancel", "Cancel")}
          </Button>
          <Button
            disabled={!name.trim() || !slug.trim()}
            onClick={async () => {
              const created = await api.createNavigation({ name, slug });
              setName("");
              setSlug("");
              onCreated(created);
            }}
          >
            {t("editor.create", "Create")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

const CopyLocaleModal = ({
  open,
  locales,
  target,
  aiConfigured,
  onClose,
  onCopy,
}: {
  open: boolean;
  locales: string[];
  target: string;
  aiConfigured: boolean;
  onClose: () => void;
  onCopy: (from: string, mode: CopyMode, overwrite: boolean) => void;
}) => {
  const { formatMessage } = useIntl();
  const [from, setFrom] = React.useState("");
  // Offering "translate" without a provider would fail on submit; default to
  // the mode that can actually run.
  const [mode, setMode] = React.useState<CopyMode>(aiConfigured ? "translate" : "structure");
  const [overwrite, setOverwrite] = React.useState(false);

  React.useEffect(() => {
    if (!aiConfigured) setMode((current) => (current === "translate" ? "structure" : current));
  }, [aiConfigured]);
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);
  const candidates = locales.filter((l) => l !== target);

  return (
    <Modal.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Typography variant="beta">{t("editor.copy-title", "Copy into “{target}”", { target })}</Typography>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <SingleSelect
              placeholder={t("editor.copy-from", "Source locale")}
              value={from}
              onChange={(next: string | number) => setFrom(String(next))}
            >
              {candidates.map((l) => (
                <SingleSelectOption key={l} value={l}>
                  {l}
                </SingleSelectOption>
              ))}
            </SingleSelect>
            <SingleSelect value={mode} onChange={(next: string | number) => setMode(next as CopyMode)}>
              <SingleSelectOption value="translate" disabled={!aiConfigured}>
                {aiConfigured
                  ? t("editor.copy-translate", "Copy and translate the labels")
                  : t("editor.copy-translate-off", "Copy and translate — no provider configured")}
              </SingleSelectOption>
              <SingleSelectOption value="structure">
                {t("editor.copy-structure", "Structure only (keeps existing translations)")}
              </SingleSelectOption>
              <SingleSelectOption value="full">
                {t("editor.copy-full", "Everything, untranslated (overwrites this locale)")}
              </SingleSelectOption>
            </SingleSelect>

            {mode === "translate" ? (
              <Checkbox
                checked={overwrite}
                onCheckedChange={(next: boolean | string) => setOverwrite(next === true)}
              >
                {t("editor.copy-overwrite", "Retranslate the labels already translated here")}
              </Checkbox>
            ) : null}

            {!aiConfigured ? (
              <Typography variant="pi" textColor="warning600">
                {t(
                  "editor.copy-translate-setup",
                  "Machine translation needs a provider key — add one under Settings → Mega Nav → Translation.",
                )}
              </Typography>
            ) : null}

            <Typography variant="pi" textColor="neutral600">
              {mode === "translate"
                ? t(
                    "editor.copy-translate-hint",
                    "Only the prose is translated — icons, images, layouts and CTA links are left as they are. Internal links need no translation: they follow the entry, which resolves in each locale.",
                  )
                : t("editor.copy-warning", "Internal links carry over automatically; labels arrive untranslated.")}
            </Typography>
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {t("editor.cancel", "Cancel")}
          </Button>
          <Button disabled={!from} onClick={() => onCopy(from, mode, overwrite)}>
            {mode === "translate" ? t("editor.copy-and-translate", "Copy and translate") : t("editor.copy", "Copy")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export default Editor;
