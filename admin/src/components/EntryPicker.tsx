import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Combobox,
  ComboboxOption,
  Field,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from "@strapi/design-system";
import { useMegaNavApi } from "../api";
import { getTranslation } from "../getTranslation";
import type { EntryHit, ResolvedRef, SourceInfo } from "../types";

interface Props {
  sources: SourceInfo[];
  locale: string;
  value: { uid: string; documentId: string } | null;
  /** Pre-resolved display info for the current value, when available. */
  resolved?: ResolvedRef;
  onChange: (ref: { uid: string; documentId: string } | null) => void;
}

/**
 * The "true internal link" picker: content type select + async autocomplete.
 * Stored as { uid, documentId } — the URL is never stored, it follows the
 * entry.
 */
const EntryPicker = ({ sources, locale, value, resolved, onChange }: Props) => {
  const { formatMessage } = useIntl();
  const api = useMegaNavApi();
  const [uid, setUid] = React.useState<string>(value?.uid ?? sources[0]?.uid ?? "");
  const [hits, setHits] = React.useState<EntryHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const searchRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (value?.uid) setUid(value.uid);
  }, [value?.uid]);

  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const search = React.useCallback(
    (q: string) => {
      if (!uid) return;
      const ticket = (searchRef.current += 1);
      setLoading(true);
      window.setTimeout(async () => {
        if (ticket !== searchRef.current) return; // debounced out
        try {
          const entries = await api.searchEntries(uid, q, locale);
          if (ticket === searchRef.current) setHits(entries);
        } catch {
          if (ticket === searchRef.current) setHits([]);
        } finally {
          if (ticket === searchRef.current) setLoading(false);
        }
      }, 300);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, locale],
  );

  React.useEffect(() => {
    search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, locale]);

  const options = React.useMemo(() => {
    const list = [...hits];
    if (value && value.uid === uid && !list.some((h) => h.documentId === value.documentId)) {
      list.unshift({
        documentId: value.documentId,
        title: resolved?.title ?? value.documentId,
        href: resolved?.href ?? null,
        published: resolved?.published ?? false,
      });
    }
    return list;
  }, [hits, value, uid, resolved]);

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Field.Root name="entry-picker-uid">
        <Field.Label>{t("picker.content-type", "Content type")}</Field.Label>
        <SingleSelect
          value={uid}
          onChange={(next: string | number) => {
            setUid(String(next));
            onChange(null);
          }}
        >
          {sources.map((source) => (
            <SingleSelectOption key={source.uid} value={source.uid}>
              {source.uid.replace(/^api::[^.]+\./, "")}
            </SingleSelectOption>
          ))}
        </SingleSelect>
      </Field.Root>

      <Field.Root name="entry-picker-entry">
        <Field.Label>{t("picker.entry", "Entry")}</Field.Label>
        <Combobox
          value={value?.documentId ?? ""}
          onChange={(documentId?: string) =>
            onChange(documentId ? { uid, documentId } : null)
          }
          onClear={() => onChange(null)}
          onInputChange={(e: React.ChangeEvent<HTMLInputElement>) => search(e.target.value)}
          loading={loading}
          autocomplete={{ type: "list", filter: "contains" }}
          placeholder={t("picker.search", "Search an entry…")}
        >
          {options.map((hit) => (
            <ComboboxOption key={hit.documentId} value={hit.documentId} textValue={hit.title}>
              <Flex gap={2} alignItems="center">
                <Typography>{hit.title}</Typography>
                {hit.href ? (
                  <Typography variant="pi" textColor="neutral500">
                    {hit.href}
                  </Typography>
                ) : null}
                {!hit.published ? <Badge size="S">{t("picker.draft", "draft")}</Badge> : null}
              </Flex>
            </ComboboxOption>
          ))}
        </Combobox>
      </Field.Root>

      {resolved?.missing ? (
        <Typography variant="pi" textColor="danger600">
          {t("picker.broken", "This entry no longer exists — the item will render as a heading.")}
        </Typography>
      ) : resolved?.href ? (
        <Typography variant="pi" textColor="neutral600">
          {resolved.href}
          {resolved.published === false ? ` — ${t("picker.draft-warn", "draft, invisible on the site until published")}` : ""}
        </Typography>
      ) : null}
    </Flex>
  );
};

export default EntryPicker;
