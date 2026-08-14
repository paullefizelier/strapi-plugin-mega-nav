import * as React from "react";
import { useIntl } from "react-intl";
import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  IconButton,
  Loader,
  Modal,
  SingleSelect,
  SingleSelectOption,
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
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from "@strapi/icons";
import { useNotification } from "@strapi/strapi/admin";
import { useMegaNavApi } from "../../api";
import { getTranslation } from "../../getTranslation";
import type { FieldDef, FieldType } from "../../types";

const FIELD_TYPES: FieldType[] = ["string", "text", "boolean", "select", "media", "url", "number"];

/**
 * Custom item fields are data (core store), so this screen IS the authority:
 * edits apply on Save without a restart. Deleting offers the two honest
 * options — disable (values kept, hidden from the editor) or purge (typed
 * confirmation, values stripped from every navigation).
 */
const FieldsSettings = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const api = useMegaNavApi();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const [fields, setFields] = React.useState<FieldDef[] | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<{ def: FieldDef; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = React.useState<FieldDef | null>(null);

  React.useEffect(() => {
    api
      .getFields()
      .then(setFields)
      .catch(() => toggleNotification({ type: "danger", message: t("settings.load-error", "Could not load.") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = (next: FieldDef[]) => {
    setFields(next);
    setDirty(true);
  };

  const move = (index: number, delta: number) => {
    if (!fields) return;
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  };

  const save = async () => {
    if (!fields) return;
    setBusy(true);
    try {
      setFields(await api.setFields(fields));
      setDirty(false);
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

  if (!fields) {
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
              {t("settings.fields.title", "Item fields")}
            </Typography>
            <Typography variant="epsilon" textColor="neutral600">
              {t(
                "settings.fields.subtitle",
                "The fields available on menu items. Changes apply on save — no restart.",
              )}
            </Typography>
          </Flex>
          <Flex gap={2}>
            <Button
              variant="secondary"
              startIcon={<Plus />}
              onClick={() =>
                setEditing({ def: { name: "", type: "string", label: "" }, isNew: true })
              }
            >
              {t("settings.fields.add", "Add a field")}
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!dirty}>
              {t("editor.save", "Save")}
            </Button>
          </Flex>
        </Flex>

        <Table colCount={6} rowCount={fields.length}>
          <Thead>
            <Tr>
              <Th>
                <Typography variant="sigma">{t("settings.fields.order", "Order")}</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">{t("settings.fields.name", "Name")}</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">{t("settings.fields.label", "Label")}</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">{t("settings.fields.type", "Type")}</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">{t("settings.fields.levels", "Levels")}</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">{t("settings.fields.actions", "Actions")}</Typography>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {fields.map((def, index) => (
              <Tr key={def.name}>
                <Td>
                  <Flex gap={1}>
                    <IconButton
                      label={t("settings.fields.move-up", "Move up")}
                      variant="ghost"
                      size="S"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label={t("settings.fields.move-down", "Move down")}
                      variant="ghost"
                      size="S"
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                  </Flex>
                </Td>
                <Td>
                  <Flex gap={2} alignItems="center">
                    <Typography fontWeight="semiBold" textColor={def.disabled ? "neutral500" : "neutral800"}>
                      {def.name}
                    </Typography>
                    {def.disabled ? <Badge size="S">{t("settings.fields.disabled", "disabled")}</Badge> : null}
                  </Flex>
                </Td>
                <Td>
                  <Typography textColor="neutral600">{def.label}</Typography>
                </Td>
                <Td>
                  <Typography textColor="neutral600">
                    {def.type}
                    {def.type === "select" && def.options?.length ? ` (${def.options.length})` : ""}
                  </Typography>
                </Td>
                <Td>
                  <Typography textColor="neutral600">
                    {def.levels?.length ? def.levels.join(", ") : t("settings.fields.all-levels", "all")}
                  </Typography>
                </Td>
                <Td>
                  <Flex gap={1}>
                    <IconButton
                      label={t("settings.fields.edit", "Edit")}
                      variant="ghost"
                      size="S"
                      onClick={() => setEditing({ def, isNew: false })}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label={t("settings.fields.delete", "Delete")}
                      variant="ghost"
                      size="S"
                      onClick={() => setDeleting(def)}
                    >
                      <Trash />
                    </IconButton>
                  </Flex>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Flex>

      {editing ? (
        <FieldModal
          initial={editing.def}
          isNew={editing.isNew}
          existingNames={fields.filter((d) => d.name !== editing.def.name).map((d) => d.name)}
          onClose={() => setEditing(null)}
          onSubmit={(def) => {
            mutate(
              editing.isNew
                ? [...fields, def]
                : fields.map((d) => (d.name === editing.def.name ? def : d)),
            );
            setEditing(null);
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteFieldDialog
          def={deleting}
          onClose={() => setDeleting(null)}
          onDisable={() => {
            mutate(fields.map((d) => (d.name === deleting.name ? { ...d, disabled: true } : d)));
            setDeleting(null);
          }}
          onPurge={async () => {
            setDeleting(null);
            setBusy(true);
            try {
              const result = await api.purgeField(deleting.name);
              setFields(result.fields);
              setDirty(false);
              toggleNotification({
                type: "success",
                message: t("settings.fields.purged", "Field removed — {count} values stripped.", {
                  count: result.removedValues,
                }),
              });
            } catch {
              toggleNotification({ type: "danger", message: t("settings.save-error", "Could not save.") });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </Box>
  );
};

const FieldModal = ({
  initial,
  isNew,
  existingNames,
  onClose,
  onSubmit,
}: {
  initial: FieldDef;
  isNew: boolean;
  existingNames: string[];
  onClose: () => void;
  onSubmit: (def: FieldDef) => void;
}) => {
  const { formatMessage } = useIntl();
  const t = (id: string, defaultMessage: string) =>
    formatMessage({ id: getTranslation(id), defaultMessage });

  const [name, setName] = React.useState(initial.name);
  const [label, setLabel] = React.useState(initial.label);
  const [type, setType] = React.useState<FieldType>(initial.type);
  const [options, setOptions] = React.useState((initial.options ?? []).join(", "));
  const [levels, setLevels] = React.useState((initial.levels ?? []).join(", "));
  const [disabled, setDisabled] = React.useState(Boolean(initial.disabled));

  const nameValid = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) && !existingNames.includes(name);
  const optionList = options
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const levelList = levels
    .split(",")
    .map((l) => Number.parseInt(l.trim(), 10))
    .filter((l) => Number.isInteger(l) && l >= 1);
  const valid = nameValid && label.trim() && (type !== "select" || optionList.length > 0);

  return (
    <Modal.Root open onOpenChange={(next: boolean) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Typography variant="beta">
            {isNew ? t("settings.fields.add", "Add a field") : t("settings.fields.edit", "Edit")}
          </Typography>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <Field.Root
              name="field-name"
              required
              hint={isNew ? t("settings.fields.name-hint", "Key in the item data — locked after creation.") : undefined}
            >
              <Field.Label>{t("settings.fields.name", "Name")}</Field.Label>
              <TextInput
                value={name}
                disabled={!isNew}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>
            <Field.Root name="field-label" required>
              <Field.Label>{t("settings.fields.label", "Label")}</Field.Label>
              <TextInput
                value={label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
              />
            </Field.Root>
            <Field.Root name="field-type" required>
              <Field.Label>{t("settings.fields.type", "Type")}</Field.Label>
              <SingleSelect value={type} onChange={(next: string | number) => setType(next as FieldType)}>
                {FIELD_TYPES.map((option) => (
                  <SingleSelectOption key={option} value={option}>
                    {option}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>
            {type === "select" ? (
              <Field.Root name="field-options" required hint={t("settings.fields.options-hint", "Comma-separated values.")}>
                <Field.Label>{t("settings.fields.options", "Options")}</Field.Label>
                <TextInput
                  value={options}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOptions(e.target.value)}
                />
                <Field.Hint />
              </Field.Root>
            ) : null}
            <Field.Root
              name="field-levels"
              hint={t("settings.fields.levels-hint", "Depths (1-based) where the field applies, comma-separated. Empty = every level.")}
            >
              <Field.Label>{t("settings.fields.levels", "Levels")}</Field.Label>
              <TextInput
                placeholder="1, 2"
                value={levels}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLevels(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>
            {!isNew ? (
              <Field.Root name="field-disabled">
                <Field.Label>{t("settings.fields.disabled-toggle", "Disabled (hidden from the editor, values kept)")}</Field.Label>
                <Toggle
                  checked={disabled}
                  onLabel={t("field.on", "On")}
                  offLabel={t("field.off", "Off")}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisabled(e.target.checked)}
                />
              </Field.Root>
            ) : null}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {t("editor.cancel", "Cancel")}
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              onSubmit({
                name,
                label,
                type,
                ...(type === "select" ? { options: optionList } : {}),
                ...(levelList.length ? { levels: levelList } : {}),
                ...(disabled ? { disabled: true } : {}),
              })
            }
          >
            {isNew ? t("settings.fields.create", "Create") : t("editor.save", "Save")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

const DeleteFieldDialog = ({
  def,
  onClose,
  onDisable,
  onPurge,
}: {
  def: FieldDef;
  onClose: () => void;
  onDisable: () => void;
  onPurge: () => void;
}) => {
  const { formatMessage } = useIntl();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);
  const [confirmation, setConfirmation] = React.useState("");

  return (
    <Dialog.Root open onOpenChange={(next: boolean) => !next && onClose()}>
      <Dialog.Content>
        <Dialog.Header>{t("settings.fields.delete-title", "Delete “{name}”?", { name: def.name })}</Dialog.Header>
        <Dialog.Body>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <Typography>
              {t(
                "settings.fields.delete-body",
                "Disabling hides the field from the editor but keeps every stored value. Purging removes the field AND strips its values from all navigations — this cannot be undone.",
              )}
            </Typography>
            <Field.Root
              name="purge-confirm"
              hint={t("settings.fields.purge-hint", "To purge, type the field name: {name}", { name: def.name })}
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
            <Button variant="tertiary" onClick={onClose}>
              {t("editor.cancel", "Cancel")}
            </Button>
          </Dialog.Cancel>
          <Button variant="secondary" onClick={onDisable}>
            {t("settings.fields.disable", "Disable (keep values)")}
          </Button>
          <Dialog.Action>
            <Button variant="danger" disabled={confirmation !== def.name} onClick={onPurge}>
              {t("settings.fields.purge", "Delete and purge")}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default FieldsSettings;
