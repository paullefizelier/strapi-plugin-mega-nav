import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  EmptyStateLayout,
  Flex,
  Loader,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useMegaNavApi } from "../../api";
import { getTranslation } from "../../getTranslation";
import type { HealthIssue, SourceInfo } from "../../types";

/**
 * Sources are host configuration (config/plugins.ts) — tied to the front's
 * routes, so deliberately code, not data. This screen reads them, flags
 * unknown uids, and runs the health check that surfaces JSON-reference drift
 * (broken internal links, dead media, path escape hatches, orphan field keys).
 */
const SourcesSettings = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const api = useMegaNavApi();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [sources, setSources] = React.useState<SourceInfo[] | null>(null);
  const [issues, setIssues] = React.useState<HealthIssue[] | null>(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    api
      .getSources()
      .then(setSources)
      .catch(() => toggleNotification({ type: "danger", message: t("settings.load-error", "Could not load.") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runHealth = async () => {
    setChecking(true);
    try {
      setIssues(await api.getHealth());
    } catch {
      toggleNotification({ type: "danger", message: t("settings.load-error", "Could not load.") });
    } finally {
      setChecking(false);
    }
  };

  if (!sources) {
    return (
      <Box padding={8}>
        <Loader>{t("editor.loading", "Loading…")}</Loader>
      </Box>
    );
  }

  return (
    <Box padding={8}>
      <Flex direction="column" alignItems="stretch" gap={6}>
        <Flex direction="column" alignItems="flex-start" gap={1}>
          <Typography variant="alpha" tag="h1">
            {t("settings.sources.title", "Internal link sources")}
          </Typography>
          <Typography variant="epsilon" textColor="neutral600">
            {t(
              "settings.sources.subtitle",
              "Configured in config/plugins.ts (mega-nav → sources) — URL patterns are tied to the site's routes, so they live in code.",
            )}
          </Typography>
        </Flex>

        {sources.length === 0 ? (
          <EmptyStateLayout
            content={t(
              "settings.sources.empty",
              "No source configured. Add sources: [{ uid, titleField, pattern }] to the plugin config to enable internal links.",
            )}
          />
        ) : (
          <Table colCount={4} rowCount={sources.length}>
            <Thead>
              <Tr>
                <Th>
                  <Typography variant="sigma">{t("settings.sources.uid", "Content type")}</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">{t("settings.sources.titleField", "Title field")}</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">{t("settings.sources.pattern", "URL pattern")}</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">{t("settings.sources.status", "Status")}</Typography>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {sources.map((source) => (
                <Tr key={source.uid}>
                  <Td>
                    <Typography fontWeight="semiBold">{source.uid}</Typography>
                  </Td>
                  <Td>
                    <Typography textColor="neutral600">{source.titleField}</Typography>
                  </Td>
                  <Td>
                    <Typography textColor="neutral600">{source.pattern ?? source.pathField ?? "—"}</Typography>
                  </Td>
                  <Td>
                    {source.known ? (
                      <Badge size="S" backgroundColor="success100" textColor="success700">
                        {t("settings.sources.ok", "ok")}
                      </Badge>
                    ) : (
                      <Badge size="S" backgroundColor="danger100" textColor="danger700">
                        {t("settings.sources.unknown", "unknown content type")}
                      </Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        <Flex direction="column" alignItems="stretch" gap={3}>
          <Flex justifyContent="space-between" alignItems="center">
            <Typography variant="beta" tag="h2">
              {t("settings.sources.health", "Health check")}
            </Typography>
            <Button onClick={() => void runHealth()} loading={checking}>
              {t("settings.sources.run-health", "Run the check")}
            </Button>
          </Flex>
          {issues === null ? (
            <Typography textColor="neutral600">
              {t(
                "settings.sources.health-hint",
                "Lists broken internal links, missing media, hand-typed path escape hatches and orphan field keys across every navigation draft.",
              )}
            </Typography>
          ) : issues.length === 0 ? (
            <Typography textColor="success700">
              {t("settings.sources.health-ok", "No issue found — every reference resolves.")}
            </Typography>
          ) : (
            <Table colCount={5} rowCount={issues.length}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma">{t("settings.sources.health-nav", "Navigation")}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t("settings.sources.health-locale", "Locale")}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t("settings.sources.health-item", "Item")}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t("settings.sources.health-kind", "Kind")}</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">{t("settings.sources.health-detail", "Detail")}</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {issues.map((issue, index) => (
                  <Tr key={`${issue.nodeId}-${issue.kind}-${index}`}>
                    <Td>
                      <Typography>{issue.navigation}</Typography>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600">{issue.locale ?? "—"}</Typography>
                    </Td>
                    <Td>
                      <Typography>{issue.title}</Typography>
                    </Td>
                    <Td>
                      <Badge size="S" backgroundColor="warning100" textColor="warning700">
                        {issue.kind}
                      </Badge>
                    </Td>
                    <Td>
                      <Typography textColor="neutral600">{issue.detail}</Typography>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Flex>
      </Flex>
    </Box>
  );
};

export default SourcesSettings;
