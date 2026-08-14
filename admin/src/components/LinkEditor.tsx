import * as React from "react";
import { useIntl } from "react-intl";
import { Field, Flex, Tabs, TextInput } from "@strapi/design-system";
import EntryPicker from "./EntryPicker";
import { getTranslation } from "../getTranslation";
import type { NavLink, ResolvedRef, SourceInfo } from "../types";

interface Props {
  link: NavLink;
  sources: SourceInfo[];
  locale: string;
  resolved?: ResolvedRef;
  onChange: (link: NavLink) => void;
}

/**
 * The typed link model, surfaced as tabs. "None" is a wrapper (group
 * heading); "path" — the escape hatch reported by the health check — is kept
 * reachable but visually last.
 */
const LinkEditor = ({ link, sources, locale, resolved, onChange }: Props) => {
  const { formatMessage } = useIntl();
  const t = (id: string, defaultMessage: string) =>
    formatMessage({ id: getTranslation(id), defaultMessage });

  return (
    <Tabs.Root
      value={link.kind}
      onValueChange={(kind: string) => {
        if (kind === link.kind) return;
        if (kind === "none") onChange({ kind: "none" });
        if (kind === "internal")
          onChange({ kind: "internal", uid: sources[0]?.uid ?? "", documentId: "" });
        if (kind === "external") onChange({ kind: "external", url: "" });
        if (kind === "path") onChange({ kind: "path", path: "/" });
      }}
    >
      <Tabs.List aria-label={t("link.kind", "Link type")}>
        <Tabs.Trigger value="internal">{t("link.internal", "Internal")}</Tabs.Trigger>
        <Tabs.Trigger value="external">{t("link.external", "External")}</Tabs.Trigger>
        <Tabs.Trigger value="none">{t("link.none", "None")}</Tabs.Trigger>
        <Tabs.Trigger value="path">{t("link.path", "Path")}</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="internal">
        <Flex direction="column" alignItems="stretch" gap={2} paddingTop={2}>
          <EntryPicker
            sources={sources}
            locale={locale}
            value={link.kind === "internal" ? { uid: link.uid, documentId: link.documentId } : null}
            resolved={resolved}
            // Stays internal whatever the picker reports: an entry not chosen
            // yet is an incomplete link, not a wrapper. Save normalizes it.
            onChange={(ref) =>
              onChange({
                kind: "internal",
                ...ref,
                ...(link.kind === "internal" && link.query ? { query: link.query } : {}),
              })
            }
          />
          <Field.Root
            name="link-query"
            hint={t("link.query-hint", "Optional query string appended to the resolved URL (e.g. family=Manutention)")}
          >
            <Field.Label>{t("link.query", "Query string")}</Field.Label>
            <TextInput
              value={link.kind === "internal" ? (link.query ?? "") : ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (link.kind !== "internal") return;
                const query = e.target.value.replace(/^\?/, "");
                onChange({ ...link, query: query || undefined });
              }}
            />
            <Field.Hint />
          </Field.Root>
        </Flex>
      </Tabs.Content>

      <Tabs.Content value="external">
        <Flex direction="column" alignItems="stretch" gap={2} paddingTop={2}>
          <Field.Root name="link-url">
            <Field.Label>{t("link.url", "URL")}</Field.Label>
            <TextInput
              placeholder="https://…"
              value={link.kind === "external" ? link.url : ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange({ kind: "external", url: e.target.value })
              }
            />
          </Field.Root>
        </Flex>
      </Tabs.Content>

      <Tabs.Content value="none">
        <Flex paddingTop={2}>
          <Field.Root name="link-none" hint={t("link.none-hint", "A heading that structures the menu — no target.")}>
            <Field.Hint />
          </Field.Root>
        </Flex>
      </Tabs.Content>

      <Tabs.Content value="path">
        <Flex direction="column" alignItems="stretch" gap={2} paddingTop={2}>
          <Field.Root
            name="link-path"
            hint={t("link.path-hint", "Hand-typed internal path — prefer an internal link; these are flagged by the health check.")}
          >
            <Field.Label>{t("link.path", "Path")}</Field.Label>
            <TextInput
              placeholder="/jobs?q=…"
              value={link.kind === "path" ? link.path : ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange({ kind: "path", path: e.target.value })
              }
            />
            <Field.Hint />
          </Field.Root>
        </Flex>
      </Tabs.Content>
    </Tabs.Root>
  );
};

export default LinkEditor;
