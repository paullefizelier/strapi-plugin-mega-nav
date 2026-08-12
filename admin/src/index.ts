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
    registerPlugin: (plugin: { id: string; name: string }) => void;
  }) {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      icon: Layout,
      intlLabel: { id: `${PLUGIN_ID}.menu.label`, defaultMessage: "Navigation" },
      Component: async () => (await import("./pages/Editor")) as { default: unknown },
      permissions: [{ action: `plugin::${PLUGIN_ID}.read`, subject: null }],
    });

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
