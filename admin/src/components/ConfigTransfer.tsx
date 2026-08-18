import * as React from "react";
import { useIntl } from "react-intl";
import { Button, Flex, Typography } from "@strapi/design-system";
import { Download, Upload } from "@strapi/icons";
import { getTranslation } from "../getTranslation";

/**
 * Export / import of a settings screen's JSON.
 *
 * Fields and layouts live in the plugin store, which is what removes the
 * "database silently overrides the config file" drift of file-based config —
 * but it also means a schema configured on staging has no way to reach
 * production. This pair of buttons is that way: download the JSON, import it on
 * the other environment. The server validates on import, so a hand-edited file
 * is rejected with a readable message instead of corrupting the store.
 */
interface Props<T> {
  /** Used in the download filename: `mega-nav-<name>.json`. */
  name: string;
  /** Current value to export. */
  value: T;
  /** Called with the parsed JSON; should persist and surface server errors. */
  onImport: (parsed: unknown) => void | Promise<void>;
  disabled?: boolean;
}

export function ConfigTransfer<T>({ name, value, onImport, disabled }: Props<T>) {
  const { formatMessage } = useIntl();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const t = (id: string, defaultMessage: string) =>
    formatMessage({ id: getTranslation(id), defaultMessage });

  const download = () => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mega-nav-${name}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      await onImport(JSON.parse(await file.text()));
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? t("transfer.bad-json", "That file is not valid JSON.")
          : (err as Error).message,
      );
    }
  };

  return (
    <Flex direction="column" alignItems="flex-start" gap={1}>
      <Flex gap={2}>
        <Button variant="tertiary" startIcon={<Download />} onClick={download} disabled={disabled}>
          {t("transfer.export", "Export JSON")}
        </Button>
        <Button
          variant="tertiary"
          startIcon={<Upload />}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {t("transfer.import", "Import JSON")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={pick}
        />
      </Flex>
      <Typography variant="pi" textColor={error ? "danger600" : "neutral600"}>
        {error ?? t("transfer.hint", "Move this configuration between environments.")}
      </Typography>
    </Flex>
  );
}

export default ConfigTransfer;
