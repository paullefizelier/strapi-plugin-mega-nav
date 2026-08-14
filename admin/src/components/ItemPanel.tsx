import * as React from "react";
import { useIntl } from "react-intl";
import {
  Accordion,
  Badge,
  Box,
  Divider,
  Field,
  Flex,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Toggle,
  Typography,
} from "@strapi/design-system";
import FieldInput from "./FieldInput";
import LinkEditor from "./LinkEditor";
import { getTranslation } from "../getTranslation";
import type { EditorAction } from "../editor/reducer";
import type { FieldDef, LayoutSpec, NavNode, ResolvedRef, SourceInfo } from "../types";

interface Props {
  node: NavNode;
  depth: number;
  /** The governing layout: the presentation of the node's level-1 ancestor. */
  layout: LayoutSpec | null;
  layouts: LayoutSpec[];
  fieldDefs: FieldDef[];
  sources: SourceInfo[];
  locale: string;
  resolvedRefs: Map<string, ResolvedRef>;
  /** Preview zone under the pointer — highlights the field that feeds it. */
  hoveredZone?: string | null;
  /** Reports the field under the pointer (highlights its preview zones). */
  onFieldHover?: (field: string | null) => void;
  dispatch: (action: EditorAction) => void;
}

/**
 * The item form, GENERATED from two runtime inputs: the field schema and the
 * governing layout's level spec. Fields the layout uses at this depth come
 * first with their hints; everything else lives in a collapsed accordion
 * where a filled-but-unused value is flagged — never silently lost.
 */
const ItemPanel = ({
  node,
  depth,
  layout,
  layouts,
  fieldDefs,
  sources,
  locale,
  resolvedRefs,
  hoveredZone = null,
  onFieldHover = () => {},
  dispatch,
}: Props) => {
  const { formatMessage } = useIntl();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);

  const levelSpec = layout?.levels[Math.min(depth, layout.levels.length) - 1];
  const layoutUses = levelSpec?.fields ?? [];
  const usedNames = new Set(layoutUses.map((u) => u.field));

  const defsByName = new Map(fieldDefs.map((d) => [d.name, d]));
  const otherDefs = fieldDefs.filter(
    (d) => !usedNames.has(d.name) && d.name !== "presentation" && !d.disabled
      && (!d.levels?.length || d.levels.includes(depth)),
  );

  const resolved =
    node.link.kind === "internal"
      ? resolvedRefs.get(`${node.link.uid}:${node.link.documentId}`)
      : undefined;

  const setField = (name: string) => (value: NavNode["fields"][string] | undefined) =>
    dispatch({ type: "set-field", id: node.id, name, value });

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Field.Root name="item-title" required>
          <Field.Label>{t("panel.title", "Title")}</Field.Label>
          <TextInput
            value={node.title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              dispatch({ type: "rename", id: node.id, title: e.target.value })
            }
          />
        </Field.Root>

        {depth === 1 ? (
          <Field.Root
            name="item-presentation"
            hint={layout?.recipe ?? t("panel.presentation-hint", "How this menu's panel is laid out")}
          >
            <Field.Label>{t("panel.presentation", "Panel layout")}</Field.Label>
            <SingleSelect
              value={typeof node.fields.presentation === "string" ? node.fields.presentation : ""}
              onClear={() => setField("presentation")(undefined)}
              onChange={(next: string | number) => setField("presentation")(String(next) || undefined)}
            >
              {layouts.map((spec) => (
                <SingleSelectOption key={spec.key} value={spec.key}>
                  {spec.label}
                </SingleSelectOption>
              ))}
            </SingleSelect>
            <Field.Hint />
          </Field.Root>
        ) : null}

        <Field.Root name="item-hidden">
          <Field.Label>{t("panel.hidden", "Hidden from the site")}</Field.Label>
          <Toggle
            checked={Boolean(node.hidden)}
            onLabel={t("field.on", "On")}
            offLabel={t("field.off", "Off")}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              dispatch({ type: "set-hidden", id: node.id, hidden: e.target.checked })
            }
          />
        </Field.Root>
      </Flex>

      <Divider />

      <Flex direction="column" alignItems="stretch" gap={2}>
        <Typography variant="sigma" textColor="neutral600">
          {t("panel.link", "Link")}
        </Typography>
        <LinkEditor
          link={node.link}
          sources={sources}
          locale={locale}
          resolved={resolved}
          onChange={(link) => dispatch({ type: "set-link", id: node.id, link })}
        />
        {levelSpec?.linkExpected && node.link.kind === "none" ? (
          <Typography variant="pi" textColor="warning600">
            {t("panel.link-expected", "Items at this level are links in the “{layout}” layout.", {
              layout: layout?.label ?? "",
            })}
          </Typography>
        ) : null}
      </Flex>

      {layoutUses.length ? (
        <>
          <Divider />
          <Flex direction="column" alignItems="stretch" gap={3}>
            <Typography variant="sigma" textColor="neutral600">
              {t("panel.layout-fields", "“{layout}” fields — {level}", {
                layout: layout?.label ?? "",
                level: levelSpec?.label ?? "",
              })}
            </Typography>
            {layoutUses.map((use) => {
              const def = defsByName.get(use.field);
              if (!def || def.disabled) return null;
              return (
                <Box
                  key={use.field}
                  hasRadius
                  onMouseEnter={() => onFieldHover(use.field)}
                  onMouseLeave={() => onFieldHover(null)}
                  style={{
                    outline: hoveredZone === use.zone ? "2px solid #ffd166" : "none",
                    outlineOffset: 2,
                  }}
                >
                  <FieldInput
                    def={def}
                    hint={use.hint}
                    value={node.fields[use.field]}
                    onChange={setField(use.field)}
                  />
                </Box>
              );
            })}
          </Flex>
        </>
      ) : null}

      {otherDefs.length ? (
        <Accordion.Root>
          <Accordion.Item value="other-fields">
            <Accordion.Header>
              <Accordion.Trigger>
                <Flex gap={2} alignItems="center">
                  {t("panel.other-fields", "Other fields")}
                  {otherDefs.some((d) => node.fields[d.name] !== undefined) ? (
                    <Badge>{t("panel.unused-filled", "filled, unused here")}</Badge>
                  ) : null}
                </Flex>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              <Box padding={4}>
                <Flex direction="column" alignItems="stretch" gap={3}>
                  {otherDefs.map((def) => (
                    <Flex key={def.name} direction="column" alignItems="stretch" gap={1}>
                      <FieldInput def={def} value={node.fields[def.name]} onChange={setField(def.name)} />
                      {node.fields[def.name] !== undefined && layout ? (
                        <Typography variant="pi" textColor="warning600">
                          {t("panel.unused-warning", "Filled but not used by the “{layout}” layout at this level.", {
                            layout: layout.label,
                          })}
                        </Typography>
                      ) : null}
                    </Flex>
                  ))}
                </Flex>
              </Box>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      ) : null}
    </Flex>
  );
};

export default ItemPanel;
