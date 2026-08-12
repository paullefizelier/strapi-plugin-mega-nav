/**
 * One document per menu; the whole tree is the localized `items` json value.
 * Draft & publish gives "edit, preview, publish atomically" for free — the
 * old plugin's per-item rows could never offer that.
 *
 * Hidden from the Content Manager on purpose: the plugin ships its own
 * editor, and the raw JSON would invite corruption.
 */
export default {
  navigation: {
    schema: {
      kind: "collectionType",
      collectionName: "mega_nav_navigations",
      info: {
        singularName: "navigation",
        pluralName: "navigations",
        displayName: "Navigation (Mega Nav)",
      },
      options: { draftAndPublish: true },
      pluginOptions: {
        i18n: { localized: true },
        "content-manager": { visible: false },
        "content-type-builder": { visible: false },
      },
      attributes: {
        name: {
          type: "string",
          required: true,
          pluginOptions: { i18n: { localized: false } },
        },
        slug: {
          type: "string",
          required: true,
          unique: true,
          regex: "^[a-z0-9-]+$",
          pluginOptions: { i18n: { localized: false } },
        },
        visible: {
          type: "boolean",
          default: true,
          pluginOptions: { i18n: { localized: false } },
        },
        items: {
          type: "json",
          pluginOptions: { i18n: { localized: true } },
        },
      },
    },
  },
};
