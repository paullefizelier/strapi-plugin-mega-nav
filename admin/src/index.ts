import { Layout } from "@strapi/icons";
import { PLUGIN_ID } from "./pluginId";
import { prefixPluginTranslations } from "./getTranslation";

/**
 * Registers the plugin and its menu link. The editor itself is lazy-loaded —
 * NOTE: entries must be async functions returning the module; React.lazy here
 * crashes the admin silently (empty #strapi, no console error).
 */
export default {
  register(app: {
    addMenuLink: (link: {
      to: string;
      icon: unknown;
      intlLabel: { id: string; defaultMessage: string };
      Component: () => Promise<{ default: unknown }>;
      permissions: { action: string; subject: null }[];
    }) => void;
    createSettingSection: (
      section: { id: string; intlLabel: { id: string; defaultMessage: string } },
      links: unknown[],
    ) => void;
    registerPlugin: (plugin: { id: string; name: string }) => void;
  }) {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      icon: Layout,
      intlLabel: { id: `${PLUGIN_ID}.menu.label`, defaultMessage: "Navigation" },
      Component: async () => (await import("./pages/Editor")) as { default: unknown },
      permissions: [{ action: `plugin::${PLUGIN_ID}.read`, subject: null }],
    });

    app.createSettingSection(
      {
        id: PLUGIN_ID,
        intlLabel: { id: `${PLUGIN_ID}.settings.section`, defaultMessage: "Mega Nav" },
      },
      [
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.fields`, defaultMessage: "Fields" },
          id: `${PLUGIN_ID}-fields`,
          to: `/settings/${PLUGIN_ID}/fields`,
          permissions: [{ action: `plugin::${PLUGIN_ID}.settings`, subject: null }],
          Component: async () => (await import("./pages/settings/FieldsSettings")).default,
        },
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.layouts`, defaultMessage: "Layouts" },
          id: `${PLUGIN_ID}-layouts`,
          to: `/settings/${PLUGIN_ID}/layouts`,
          permissions: [{ action: `plugin::${PLUGIN_ID}.settings`, subject: null }],
          Component: async () => (await import("./pages/settings/LayoutsSettings")).default,
        },
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.sources`, defaultMessage: "Sources" },
          id: `${PLUGIN_ID}-sources`,
          to: `/settings/${PLUGIN_ID}/sources`,
          permissions: [{ action: `plugin::${PLUGIN_ID}.read`, subject: null }],
          Component: async () => (await import("./pages/settings/SourcesSettings")).default,
        },
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.ai`, defaultMessage: "Translation" },
          id: `${PLUGIN_ID}-ai`,
          to: `/settings/${PLUGIN_ID}/ai`,
          permissions: [{ action: `plugin::${PLUGIN_ID}.settings`, subject: null }],
          Component: async () => (await import("./pages/settings/AiSettings")).default,
        },
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.migration`, defaultMessage: "Migration" },
          id: `${PLUGIN_ID}-migration`,
          to: `/settings/${PLUGIN_ID}/migration`,
          permissions: [{ action: `plugin::${PLUGIN_ID}.migrate`, subject: null }],
          Component: async () => (await import("./pages/settings/MigrationPage")).default,
        },
      ],
    );

    app.registerPlugin({ id: PLUGIN_ID, name: PLUGIN_ID });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data: prefixPluginTranslations(data), locale };
        } catch {
          return { data: {}, locale };
        }
      }),
    );
  },
};
