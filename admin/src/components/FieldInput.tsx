import * as React from "react";
import { useIntl } from "react-intl";
import {
  Button,
  Field,
  Flex,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  TextInput,
  Toggle,
  Typography,
} from "@strapi/design-system";
import { useStrapiApp } from "@strapi/strapi/admin";
import { getTranslation } from "../getTranslation";
import type { FieldDef, FieldValue, MediaRef } from "../types";

interface Props {
  def: FieldDef;
  value: FieldValue | undefined;
  hint?: string;
  onChange: (value: FieldValue | undefined) => void;
}

interface MediaLibraryAsset {
  id: number;
  documentId?: string;
  url?: string;
  alternativeText?: string | null;
}

/** One item field, rendered from its runtime definition. */
const FieldInput = ({ def, value, hint, onChange }: Props) => {
  const { formatMessage } = useIntl();
  // The upload plugin registers its dialog in the app's component library.
  const components = useStrapiApp("MegaNavFieldInput", (state) => state.components);
  const [mediaOpen, setMediaOpen] = React.useState(false);

  const t = (id: string, defaultMessage: string) =>
    formatMessage({ id: getTranslation(id), defaultMessage });

  const common = (
    <>
      <Field.Label>{def.label}</Field.Label>
    </>
  );

  if (def.type === "boolean") {
    return (
      <Field.Root name={`field-${def.name}`} hint={hint}>
        {common}
        <Toggle
          checked={value === true}
          onLabel={t("field.on", "On")}
          offLabel={t("field.off", "Off")}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.checked ? true : undefined)
          }
        />
        <Field.Hint />
      </Field.Root>
    );
  }

  if (def.type === "select") {
    return (
      <Field.Root name={`field-${def.name}`} hint={hint}>
        {common}
        <SingleSelect
          value={typeof value === "string" ? value : ""}
          onClear={() => onChange(undefined)}
          onChange={(next: string | number) => onChange(String(next) || undefined)}
        >
          {(def.options ?? []).map((option) => (
            <SingleSelectOption key={option} value={option}>
              {option}
            </SingleSelectOption>
          ))}
        </SingleSelect>
        <Field.Hint />
      </Field.Root>
    );
  }

  if (def.type === "number") {
    return (
      <Field.Root name={`field-${def.name}`} hint={hint}>
        {common}
        <NumberInput
          value={typeof value === "number" ? value : undefined}
          onValueChange={(next?: number) => onChange(next ?? undefined)}
        />
        <Field.Hint />
      </Field.Root>
    );
  }

  if (def.type === "media") {
    const media = value && typeof value === "object" && "media" in value ? value.media : null;
    const MediaLibraryDialog = components?.["media-library"] as
      | React.ComponentType<{
          onClose: () => void;
          onSelectAssets: (assets: MediaLibraryAsset[]) => void;
          allowedTypes?: string[];
        }>
      | undefined;
    return (
      <Field.Root name={`field-${def.name}`} hint={hint}>
        {common}
        <Flex gap={2} alignItems="center">
          {media?.url ? (
            <img
              src={media.url}
              alt={media.alternativeText ?? ""}
              style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 4 }}
            />
          ) : null}
          <Typography variant="pi" textColor="neutral600" style={{ flex: 1 }}>
            {media ? (media.url?.split("/").pop() ?? `#${media.id}`) : t("field.no-media", "No image")}
          </Typography>
          {MediaLibraryDialog ? (
            <Button variant="tertiary" size="S" onClick={() => setMediaOpen(true)}>
              {t("field.choose-media", "Choose")}
            </Button>
          ) : null}
          {media ? (
            <Button variant="danger-light" size="S" onClick={() => onChange(undefined)}>
              {t("field.remove-media", "Remove")}
            </Button>
          ) : null}
        </Flex>
        {mediaOpen && MediaLibraryDialog ? (
          <MediaLibraryDialog
            allowedTypes={["images"]}
            onClose={() => setMediaOpen(false)}
            onSelectAssets={(assets) => {
              const asset = assets[0];
              if (asset?.id) {
                const ref: MediaRef = {
                  id: asset.id,
                  documentId: asset.documentId ?? "",
                  url: asset.url,
                  alternativeText: asset.alternativeText ?? undefined,
                };
                onChange({ media: ref });
              }
              setMediaOpen(false);
            }}
          />
        ) : null}
        <Field.Hint />
      </Field.Root>
    );
  }

  if (def.type === "text") {
    return (
      <Field.Root name={`field-${def.name}`} hint={hint}>
        {common}
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onChange(e.target.value || undefined)
          }
        />
        <Field.Hint />
      </Field.Root>
    );
  }

  // string | url
  return (
    <Field.Root name={`field-${def.name}`} hint={hint}>
      {common}
      <TextInput
        placeholder={def.type === "url" ? "https://… ou /chemin" : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value || undefined)}
      />
      <Field.Hint />
    </Field.Root>
  );
};

export default FieldInput;
