import * as React from "react";
import { useIntl } from "react-intl";
import {
  Accordion,
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  JSONInput,
  Loader,
  Typography,
} from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useMegaNavApi } from "../../api";
import ConfigTransfer from "../../components/ConfigTransfer";
import { getTranslation } from "../../getTranslation";
import type { LayoutSpec } from "../../types";

/**
 * v1 layout editing is honest-but-raw: one validated JSON document per layout
 * (the visual mapper is v2). The server re-validates on save; "Restore
 * defaults" reseeds the built-in specs for the reference front's ten layouts.
 */
const LayoutsSettings = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const api = useMegaNavApi();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [layouts, setLayouts] = React.useState<LayoutSpec[] | null>(null);
  /** Raw JSON text per layout key — only keys the user touched. */
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  React.useEffect(() => {
    api
      .getLayouts()
      .then(setLayouts)
      .catch(() => toggleNotification({ type: "danger", message: t("settings.load-error", "Could not load.") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = Object.keys(drafts).length > 0;

  const save = async () => {
    if (!layouts) return;
    const next: LayoutSpec[] = [];
    const parseErrors: Record<string, string> = {};
    for (const layout of layouts) {
      const raw = drafts[layout.key];
      if (raw === undefined) {
        next.push(layout);
        continue;
      }
      try {
        next.push(JSON.parse(raw) as LayoutSpec);
      } catch {
        parseErrors[layout.key] = t("settings.layouts.invalid-json", "Invalid JSON");
      }
    }
    setErrors(parseErrors);
    if (Object.keys(parseErrors).length) return;

    setBusy(true);
    try {
      setLayouts(await api.setLayouts(next));
      setDrafts({});
      toggleNotification({ type: "success", message: t("settings.saved", "Saved.") });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        t("settings.save-error", "Could not save.");
      toggleNotification({ type: "danger", message });
    } finally {
      setBusy(false);
    }
  };

  if (!layouts) {
    return (
      <Box padding={8}>
        <Loader>{t("editor.loading", "Loading…")}</Loader>
      </Box>
    );
  }

  return (
    <Box padding={8}>
      <Flex direction="column" alignItems="stretch" gap={4}>
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Flex direction="column" alignItems="flex-start" gap={1}>
            <Typography variant="alpha" tag="h1">
              {t("settings.layouts.title", "Layouts")}
            </Typography>
            <Typography variant="epsilon" textColor="neutral600">
              {t(
                "settings.layouts.subtitle",
                "Each layout describes its levels, the fields each level uses, and its preview template. Edited as JSON in v1.",
              )}
            </Typography>
          </Flex>
          <Flex gap={2}>
            <Button variant="danger-light" onClick={() => setResetOpen(true)}>
              {t("settings.layouts.reset", "Restore defaults")}
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!dirty}>
              {t("editor.save", "Save")}
            </Button>
          </Flex>
        </Flex>

        <ConfigTransfer
          name="layouts"
          value={layouts}
          disabled={busy}
          onImport={async (parsed) => {
            if (!Array.isArray(parsed)) {
              throw new Error(t("transfer.expected-array-layouts", "Expected a JSON array of layouts."));
            }
            setLayouts(await api.setLayouts(parsed as LayoutSpec[]));
            // Imported content replaces the screen's state, so any half-edited
            // JSON draft is now stale.
            setDrafts({});
            toggleNotification({ type: "success", message: t("transfer.imported", "Configuration imported.") });
          }}
        />

        <Accordion.Root>
          {layouts.map((layout) => (
            <Accordion.Item key={layout.key} value={layout.key}>
              <Accordion.Header>
                <Accordion.Trigger>
                  <Flex gap={2} alignItems="center">
                    <Typography fontWeight="semiBold">{layout.label}</Typography>
                    <Typography variant="pi" textColor="neutral500">
                      {layout.key} · {t("settings.layouts.levels", "{count} levels", { count: layout.levels.length })} · {layout.preview.template}
                    </Typography>
                    {drafts[layout.key] !== undefined ? (
                      <Badge size="S">{t("settings.layouts.modified", "modified")}</Badge>
                    ) : null}
                  </Flex>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Box padding={4}>
                  <Flex direction="column" alignItems="stretch" gap={2}>
                    <Typography variant="pi" textColor="neutral600">
                      {layout.recipe}
                    </Typography>
                    <JSONInput
                      value={drafts[layout.key] ?? JSON.stringify(layout, null, 2)}
                      onChange={(value: string) =>
                        setDrafts((prev) => ({ ...prev, [layout.key]: value }))
                      }
                    />
                    {errors[layout.key] ? (
                      <Typography variant="pi" textColor="danger600">
                        {errors[layout.key]}
                      </Typography>
                    ) : null}
                  </Flex>
                </Box>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </Flex>

      <Dialog.Root open={resetOpen} onOpenChange={setResetOpen}>
        <Dialog.Content>
          <Dialog.Header>{t("settings.layouts.reset", "Restore defaults")}</Dialog.Header>
          <Dialog.Body>
            {t(
              "settings.layouts.reset-body",
              "Every customization is discarded and the built-in layout definitions are restored.",
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Cancel>
              <Button variant="tertiary">{t("editor.cancel", "Cancel")}</Button>
            </Dialog.Cancel>
            <Dialog.Action>
              <Button
                variant="danger"
                onClick={async () => {
                  setResetOpen(false);
                  setBusy(true);
                  try {
                    setLayouts(await api.resetLayouts());
                    setDrafts({});
                    setErrors({});
                    toggleNotification({ type: "success", message: t("settings.layouts.reset-done", "Defaults restored.") });
                  } catch {
                    toggleNotification({ type: "danger", message: t("settings.save-error", "Could not save.") });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("settings.layouts.reset-confirm", "Restore")}
              </Button>
            </Dialog.Action>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default LayoutsSettings;
