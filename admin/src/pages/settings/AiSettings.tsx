import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  Loader,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from "@strapi/design-system";
import { useFetchClient, useNotification } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "../../pluginId";
import { getTranslation } from "../../getTranslation";

/**
 * Machine-translation credentials. The key is written to the plugin store and
 * never read back: the screen only ever learns whether one exists, where it
 * comes from and its last four characters.
 */

type Provider = "google" | "openai" | "anthropic" | "mistral";

interface AiSettings {
  provider: Provider;
  model: string;
  configured: boolean;
  keySource: "settings" | "config" | "env" | null;
  hint: string;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "google", label: "Google (Gemini)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "mistral", label: "Mistral" },
];

const AiSettingsPage = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const { get, put, post } = useFetchClient();

  const [settings, setSettings] = React.useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const load = React.useCallback(async () => {
    const { data } = await get<AiSettings>(`/${PLUGIN_ID}/ai`);
    setSettings(data);
  }, [get]);

  React.useEffect(() => {
    load().catch(() => setFeedback({ tone: "danger", text: t("ai.load-error", "Could not read the settings.") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const save = async (patch: Partial<{ provider: Provider; model: string; apiKey: string | null }>) => {
    setBusy(true);
    setFeedback(null);
    try {
      const { data } = await put<AiSettings>(`/${PLUGIN_ID}/ai`, patch);
      setSettings(data);
      setApiKey("");
      toggleNotification({ type: "success", message: t("ai.saved", "Settings saved.") });
    } catch {
      setFeedback({ tone: "danger", text: t("ai.save-error", "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const { data } = await post<{ ok: boolean; sample?: string; error?: string }>(`/${PLUGIN_ID}/ai/test`);
      setFeedback(
        data.ok
          ? { tone: "success", text: t("ai.test-ok", "It works — “Contact us” came back as “{sample}”.", { sample: data.sample ?? "" }) }
          : { tone: "danger", text: data.error ?? t("ai.test-failed", "The provider refused the request.") },
      );
    } catch {
      setFeedback({ tone: "danger", text: t("ai.test-failed", "The provider refused the request.") });
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <Box padding={8}>
        <Loader small>{t("ai.loading", "Loading…")}</Loader>
      </Box>
    );
  }

  const sourceLabel: Record<NonNullable<AiSettings["keySource"]>, string> = {
    settings: t("ai.source.settings", "entered here"),
    config: t("ai.source.config", "config/plugins.ts"),
    env: t("ai.source.env", "environment variable"),
  };

  return (
    <Box padding={8}>
      <Flex direction="column" alignItems="stretch" gap={6}>
        <Flex direction="column" alignItems="flex-start" gap={2}>
          <Typography variant="alpha" tag="h1">
            {t("ai.title", "Machine translation")}
          </Typography>
          <Typography variant="epsilon" textColor="neutral600">
            {t(
              "ai.subtitle",
              "Used by “Copy from locale” to translate menu labels. Links are never touched: they reference an entry, which the render resolves in each locale.",
            )}
          </Typography>
        </Flex>

        <Flex gap={2} alignItems="center">
          <Badge active={settings.configured}>
            {settings.configured
              ? t("ai.configured", "Key configured {hint}", { hint: settings.hint })
              : t("ai.not-configured", "No key")}
          </Badge>
          {settings.keySource ? (
            <Typography variant="pi" textColor="neutral600">
              {t("ai.source", "source: {source}", { source: sourceLabel[settings.keySource] })}
            </Typography>
          ) : null}
        </Flex>

        <Box maxWidth="32rem">
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Field.Root name="provider">
              <Field.Label>{t("ai.provider", "Provider")}</Field.Label>
              <SingleSelect
                value={settings.provider}
                onChange={(next: string | number) => save({ provider: next as Provider })}
              >
                {PROVIDERS.map((p) => (
                  <SingleSelectOption key={p.value} value={p.value}>
                    {p.label}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>

            <Field.Root
              name="model"
              hint={t("ai.model-hint", "Any model id the provider accepts. Changing provider resets it to a sensible default.")}
            >
              <Field.Label>{t("ai.model", "Model")}</Field.Label>
              <TextInput
                value={settings.model}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({ ...settings, model: e.target.value })
                }
                onBlur={() => save({ model: settings.model })}
              />
              <Field.Hint />
            </Field.Root>

            <Field.Root
              name="apiKey"
              hint={t("ai.key-hint", "Stored server-side and never sent back to the browser. A key entered here wins over config and environment.")}
            >
              <Field.Label>{t("ai.key", "API key")}</Field.Label>
              <TextInput
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder={settings.configured ? "••••••••" : "sk-…"}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>
          </Flex>
        </Box>

        <Flex gap={2}>
          <Button onClick={() => save({ apiKey })} loading={busy} disabled={!apiKey.trim()}>
            {t("ai.save-key", "Save the key")}
          </Button>
          <Button variant="secondary" onClick={test} loading={busy} disabled={!settings.configured}>
            {t("ai.test", "Test")}
          </Button>
          <Button
            variant="danger-light"
            onClick={() => save({ apiKey: null })}
            loading={busy}
            disabled={settings.keySource !== "settings"}
          >
            {t("ai.remove-key", "Remove the key")}
          </Button>
        </Flex>

        {feedback ? (
          <Typography variant="pi" textColor={feedback.tone === "success" ? "success600" : "danger600"}>
            {feedback.text}
          </Typography>
        ) : null}

        <Box paddingTop={4}>
          <Typography variant="pi" textColor="neutral600">
            {t(
              "ai.fields-note",
              "Which values get translated is decided per field, under Fields: prose is translated, identifiers (icons, URLs, layout and lookup keys) never are.",
            )}
          </Typography>
        </Box>
      </Flex>
    </Box>
  );
};

export default AiSettingsPage;
