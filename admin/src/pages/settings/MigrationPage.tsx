import * as React from "react";
import { useIntl } from "react-intl";
// NOTE: no react-router-dom import here — a file:-linked plugin bundles its
// own copy, whose router context is null inside the host admin (crash:
// "Cannot destructure property 'future' of useContext"). Plain href instead.
import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  Loader,
  Table,
  Tbody,
  Td,
  TextInput,
  Th,
  Thead,
  Toggle,
  Tr,
  Typography,
} from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useMegaNavApi } from "../../api";
import { getTranslation } from "../../getTranslation";
import { PLUGIN_ID } from "../../pluginId";
import type { MigrationReport } from "../../types";

const Card = ({ children }: { children: React.ReactNode }) => (
  <Box background="neutral0" hasRadius padding={6} shadow="tableShadow">
    {children}
  </Box>
);

/**
 * The four-state migration flow: auto-detection (a scan is a full dry-run,
 * safe to fire on load) → options → simulation with the complete report →
 * import, gated behind a fresh simulation and a typed confirmation whenever
 * the target already holds a navigation with the same slug.
 */
const MigrationPage = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const api = useMegaNavApi();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [detection, setDetection] = React.useState<MigrationReport | null>(null);
  const [detectionFailed, setDetectionFailed] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState(false);
  const [simulation, setSimulation] = React.useState<MigrationReport | null>(null);
  const [result, setResult] = React.useState<MigrationReport | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");

  React.useEffect(() => {
    api
      .migrationScan()
      .then(setDetection)
      .catch(() => setDetectionFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simulate = async () => {
    setBusy(true);
    setResult(null);
    try {
      setSimulation(await api.migrationScan({ overwrite }));
    } catch {
      toggleNotification({ type: "danger", message: t("migration.error", "The migration engine failed.") });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setConfirmOpen(false);
    setConfirmation("");
    setBusy(true);
    try {
      const report = await api.migrationRun({ overwrite });
      setResult(report);
      toggleNotification({ type: "success", message: t("migration.done", "Migration complete.") });
    } catch {
      toggleNotification({ type: "danger", message: t("migration.error", "The migration engine failed.") });
    } finally {
      setBusy(false);
    }
  };

  /** Import needs the typed confirmation when any target slug already exists. */
  const touchesExisting = Boolean(simulation?.navigations.some((nav) => nav.action !== "create"));

  if (!detection && !detectionFailed) {
    return (
      <Box padding={8}>
        <Loader>{t("migration.detecting", "Looking for strapi-plugin-navigation data…")}</Loader>
      </Box>
    );
  }

  return (
    <Box padding={8}>
      <Flex direction="column" alignItems="stretch" gap={4}>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Typography variant="alpha" tag="h1">
            {t("migration.title", "Import from strapi-plugin-navigation")}
          </Typography>
          <Typography variant="epsilon" textColor="neutral600">
            {t(
              "migration.subtitle",
              "Reads the old plugin's tables directly — both plugins can stay installed during the transition.",
            )}
          </Typography>
        </Flex>

        {/* 1 — Detection */}
        <Card>
          <Flex direction="column" alignItems="stretch" gap={2}>
            <Typography variant="beta" tag="h2">
              {t("migration.step-detect", "1 · Detection")}
            </Typography>
            {detectionFailed || !detection ? (
              <Typography textColor="danger600">
                {t("migration.detect-error", "The scan failed — check the server logs.")}
              </Typography>
            ) : !detection.ok ? (
              <Typography textColor="neutral600">
                {t(
                  "migration.not-found",
                  "No strapi-plugin-navigation tables in this database — nothing to migrate.",
                )}
              </Typography>
            ) : (
              <Typography>
                {t("migration.found", "{count} navigation(s) detected:", {
                  count: detection.navigations.length,
                })}{" "}
                {detection.navigations
                  .map((nav) => `${nav.name} (${nav.slug} — ${Object.keys(nav.locales).join(", ")})`)
                  .join(" · ")}
              </Typography>
            )}
          </Flex>
        </Card>

        {detection?.ok ? (
          <>
            {/* 2 — Options */}
            <Card>
              <Flex direction="column" alignItems="stretch" gap={3}>
                <Typography variant="beta" tag="h2">
                  {t("migration.step-options", "2 · Options")}
                </Typography>
                <Field.Root
                  name="overwrite"
                  hint={t(
                    "migration.overwrite-hint",
                    "Off: a navigation whose slug already exists here is skipped and reported. On: it is replaced.",
                  )}
                >
                  <Field.Label>{t("migration.overwrite", "Overwrite existing navigations")}</Field.Label>
                  <Toggle
                    checked={overwrite}
                    onLabel={t("field.on", "On")}
                    offLabel={t("field.off", "Off")}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setOverwrite(e.target.checked);
                      // Options changed: the previous simulation no longer covers the run.
                      setSimulation(null);
                    }}
                  />
                  <Field.Hint />
                </Field.Root>
                <Typography variant="pi" textColor="neutral600">
                  {t(
                    "migration.links-note",
                    "Relative legacy links are matched against the configured sources and become true internal links; the rest is kept as raw paths and reported.",
                  )}
                </Typography>
              </Flex>
            </Card>

            {/* 3 — Simulation */}
            <Card>
              <Flex direction="column" alignItems="stretch" gap={3}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Typography variant="beta" tag="h2">
                    {t("migration.step-simulate", "3 · Simulation (dry-run)")}
                  </Typography>
                  <Flex gap={2}>
                    {simulation ? (
                      <Button
                        variant="tertiary"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(simulation, null, 2)], {
                            type: "application/json",
                          });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "mega-nav-migration-report.json";
                          link.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        {t("migration.export", "Export the report (JSON)")}
                      </Button>
                    ) : null}
                    <Button variant="secondary" onClick={() => void simulate()} loading={busy}>
                      {t("migration.simulate", "Simulate")}
                    </Button>
                  </Flex>
                </Flex>
                {simulation ? (
                  <ReportTable report={simulation} t={t} />
                ) : (
                  <Typography textColor="neutral600">
                    {t(
                      "migration.simulate-hint",
                      "Runs the whole pipeline — reads, link normalization, media checks, locale pairing — without writing anything.",
                    )}
                  </Typography>
                )}
              </Flex>
            </Card>

            {/* 4 — Import */}
            <Card>
              <Flex direction="column" alignItems="stretch" gap={3}>
                <Typography variant="beta" tag="h2">
                  {t("migration.step-import", "4 · Import")}
                </Typography>
                {result ? (
                  <>
                    <ReportTable report={result} t={t} />
                    <Flex gap={2} alignItems="center">
                      <Button
                        variant="success"
                        onClick={() => window.location.assign(`/admin/plugins/${PLUGIN_ID}`)}
                      >
                        {t("migration.open-editor", "Open in the editor")}
                      </Button>
                      <Typography variant="pi" textColor="neutral600">
                        {t(
                          "migration.uninstall-reminder",
                          "Verify the result, point the site to this plugin's render endpoint, then uninstall strapi-plugin-navigation.",
                        )}
                      </Typography>
                    </Flex>
                  </>
                ) : (
                  <Flex gap={3} alignItems="center">
                    <Button
                      variant="danger"
                      disabled={!simulation || busy}
                      onClick={() => (touchesExisting ? setConfirmOpen(true) : void run())}
                    >
                      {t("migration.run", "Import now")}
                    </Button>
                    <Typography variant="pi" textColor="neutral600">
                      {simulation
                        ? t("migration.run-ready", "The import replays exactly what the simulation reported.")
                        : t("migration.run-gated", "Run a simulation first — the import stays locked until then.")}
                    </Typography>
                  </Flex>
                )}
              </Flex>
            </Card>
          </>
        ) : null}
      </Flex>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Content>
          <Dialog.Header>{t("migration.confirm-title", "Existing navigations are affected")}</Dialog.Header>
          <Dialog.Body>
            <Flex direction="column" alignItems="stretch" gap={3}>
              <Typography>
                {overwrite
                  ? t(
                      "migration.confirm-overwrite",
                      "At least one existing navigation will be REPLACED by the import.",
                    )
                  : t(
                      "migration.confirm-skip",
                      "At least one navigation already exists and will be skipped (overwrite is off).",
                    )}
              </Typography>
              <Field.Root
                name="migration-confirm"
                hint={t("migration.confirm-hint", "Type IMPORT to continue.")}
              >
                <TextInput
                  value={confirmation}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmation(e.target.value)}
                />
                <Field.Hint />
              </Field.Root>
            </Flex>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Cancel>
              <Button variant="tertiary">{t("editor.cancel", "Cancel")}</Button>
            </Dialog.Cancel>
            <Dialog.Action>
              <Button variant="danger" disabled={confirmation !== "IMPORT"} onClick={() => void run()}>
                {t("migration.run", "Import now")}
              </Button>
            </Dialog.Action>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

const ReportTable = ({
  report,
  t,
}: {
  report: MigrationReport;
  t: (id: string, defaultMessage: string, values?: Record<string, string | number>) => string;
}) => {
  const rows = report.navigations.flatMap((nav) =>
    Object.entries(nav.locales).map(([locale, stats]) => ({ nav, locale, stats })),
  );
  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Table colCount={7} rowCount={rows.length}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma">{t("migration.col-nav", "Navigation")}</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">{t("migration.col-locale", "Locale")}</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">{t("migration.col-action", "Action")}</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">{t("migration.col-items", "Items")}</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">{t("migration.col-links", "Links (int / ext / path / none)")}</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">{t("migration.col-media", "Media (ok / missing)")}</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">{t("migration.col-notes", "Notes")}</Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map(({ nav, locale, stats }) => {
            const notes: string[] = [];
            if (stats.pathFallbacks.length)
              notes.push(t("migration.note-paths", "{count} raw path(s)", { count: stats.pathFallbacks.length }));
            if (stats.unknownFieldKeys.length)
              notes.push(
                t("migration.note-unknown", "legacy keys: {keys}", { keys: stats.unknownFieldKeys.join(", ") }),
              );
            if (stats.unpaired)
              notes.push(t("migration.note-unpaired", "{count} unpaired item(s)", { count: stats.unpaired }));
            if (stats.menuDetachedRoots.length)
              notes.push(
                t("migration.note-hidden", "{count} hidden root(s)", { count: stats.menuDetachedRoots.length }),
              );
            return (
              <Tr key={`${nav.slug}-${locale}`}>
                <Td>
                  <Typography fontWeight="semiBold">{nav.slug}</Typography>
                </Td>
                <Td>
                  <Typography>{locale}</Typography>
                </Td>
                <Td>
                  <Badge
                    size="S"
                    backgroundColor={
                      nav.action === "create" ? "success100" : nav.action === "overwrite" ? "danger100" : "neutral150"
                    }
                    textColor={
                      nav.action === "create" ? "success700" : nav.action === "overwrite" ? "danger700" : "neutral700"
                    }
                  >
                    {nav.action}
                  </Badge>
                </Td>
                <Td>
                  <Typography>{stats.items}</Typography>
                </Td>
                <Td>
                  <Typography textColor="neutral600">
                    {stats.links.internal} / {stats.links.external} / {stats.links.path} / {stats.links.none}
                  </Typography>
                </Td>
                <Td>
                  <Typography textColor={stats.mediaMissing ? "danger600" : "neutral600"}>
                    {stats.mediaRelinked} / {stats.mediaMissing}
                  </Typography>
                </Td>
                <Td>
                  <Typography variant="pi" textColor="neutral600">
                    {notes.length ? notes.join(" · ") : "—"}
                  </Typography>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
      {report.warnings.length ? (
        <Flex direction="column" alignItems="stretch" gap={1}>
          {report.warnings.map((warning, index) => (
            <Typography key={index} variant="pi" textColor="warning600">
              {warning}
            </Typography>
          ))}
        </Flex>
      ) : null}
      {report.morphDuplicatesDeduped ? (
        <Typography variant="pi" textColor="neutral600">
          {t("migration.deduped", "{count} draft/published morph duplicate(s) deduplicated.", {
            count: report.morphDuplicatesDeduped,
          })}
        </Typography>
      ) : null}
    </Flex>
  );
};

export default MigrationPage;
