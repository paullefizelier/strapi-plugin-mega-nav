import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { cacheClear, cacheGet, cacheKey, cacheSet, makeInvalidationMiddleware, watchedUids } from "./cache";
import contentTypes from "./content-types";
import { getFieldDefs, purgeField, seedFieldDefs, setFieldDefs, type FieldDef } from "./fields";
import { runHealthCheck } from "./health";
import { copyLocale, NAVIGATION_UID, type CopyMode } from "./i18n";
import { getLayoutSpecs, resetLayoutSpecs, seedLayoutSpecs, setLayoutSpecs, type LayoutSpec } from "./layouts";
import { renderV1, renderV2, type RenderContext } from "./render";
import { resolveTree } from "./resolve";
import { migrate } from "./migration/run";
import { getSources, resolveRefs, searchEntries, sourceByUid } from "./sources";
import { validateTree, type NavNode } from "./tree";

/**
 * Host configuration (config/plugins.ts):
 *
 * "mega-nav": {
 *   enabled: true,
 *   config: {
 *     sources: [
 *       { uid: "api::page.page", titleField: "title", pattern: "/{path}" },
 *       { uid: "api::article.article", titleField: "Title", pattern: "/actualites/{Slug}" },
 *     ],
 *     maxDepth: 4,
 *     cache: { ttl: 60 },
 *     dropBrokenLinks: false,   // false = broken internal link degrades to WRAPPER
 *     emitLegacyLinkField: true, // mirror hrefs into additionalFields.link (v1)
 *     claimLegacyRoute: false,  // serve GET /api/navigation/render/:slug too
 *   },
 * }
 *
 * Item FIELDS are not configured here — they are data, editable from the
 * admin without a restart (see fields.ts / layouts.ts).
 */

const ACTIONS = {
  read: "plugin::mega-nav.read",
  update: "plugin::mega-nav.update",
  settings: "plugin::mega-nav.settings",
  migrate: "plugin::mega-nav.migrate",
};

const config = {
  default: {
    sources: [] as unknown[],
    maxDepth: 4,
    cache: { ttl: 60 },
    dropBrokenLinks: false,
    emitLegacyLinkField: true,
    claimLegacyRoute: false,
  },
  validator(cfg: { sources?: unknown; maxDepth?: unknown }) {
    if (cfg.sources && !Array.isArray(cfg.sources)) {
      throw new Error("mega-nav: `sources` must be an array of { uid, titleField, pattern? }");
    }
    if (cfg.maxDepth !== undefined && (!Number.isInteger(cfg.maxDepth) || (cfg.maxDepth as number) < 1)) {
      throw new Error("mega-nav: `maxDepth` must be a positive integer");
    }
  },
};

/** Shared by the plugin render route and the optional legacy alias. */
async function renderNavigation(
  strapi: Core.Strapi,
  idOrSlug: string,
  {
    locale,
    status = "published",
    format = "v1",
  }: { locale?: string; status?: "draft" | "published"; format?: "v1" | "v2" },
): Promise<Record<string, unknown>[] | null> {
  const ttlMs = ((strapi.plugin("mega-nav").config("cache", { ttl: 60 }) as { ttl?: number }).ttl ?? 60) * 1000;
  const key = cacheKey(["render", idOrSlug, locale, status, format]);
  if (status === "published" && ttlMs > 0) {
    const hit = cacheGet<Record<string, unknown>[]>(key, ttlMs);
    if (hit) return hit;
  }

  const navigation = (await strapi.documents(NAVIGATION_UID as never).findFirst({
    filters: { $or: [{ slug: idOrSlug }, { documentId: idOrSlug }], visible: true },
    locale,
    status,
  } as never)) as unknown as { items?: NavNode[] } | null;
  if (!navigation) return null;

  const nodes = (navigation.items ?? []) as NavNode[];
  const sources = sourceByUid(strapi);
  const resolved = await resolveTree(strapi, nodes, sources, locale);
  const ctx: RenderContext = {
    resolved,
    sources,
    fieldDefs: await getFieldDefs(strapi),
    locale,
    baseUrl: (strapi.config.get("server.absoluteUrl", "") as string) || "",
    maxDepth: strapi.plugin("mega-nav").config("maxDepth", 4) as number,
    dropBrokenLinks: strapi.plugin("mega-nav").config("dropBrokenLinks", false) as boolean,
    emitLegacyLinkField: strapi.plugin("mega-nav").config("emitLegacyLinkField", true) as boolean,
  };
  const payload = format === "v2" ? renderV2(nodes, ctx) : renderV1(nodes, ctx);
  if (status === "published" && ttlMs > 0) cacheSet(key, payload);
  return payload;
}

interface Ctx {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  request: { body?: never };
  body: unknown;
  throw: (status: number, message: string) => never;
}

const controllers = {
  render: ({ strapi }: { strapi: Core.Strapi }) => ({
    async render(ctx: Ctx) {
      const status = ctx.query.status === "draft" ? "draft" : "published";
      const format = ctx.query.format === "v2" ? "v2" : "v1";
      const payload = await renderNavigation(strapi, ctx.params.idOrSlug, {
        locale: ctx.query.locale,
        status,
        format,
      });
      if (!payload) ctx.throw(404, "Navigation not found");
      ctx.body = payload;
    },
  }),

  navigations: ({ strapi }: { strapi: Core.Strapi }) => ({
    async list(ctx: { body: unknown }) {
      // db layer: one query returns every locale row, grouped client-side —
      // the editor's switcher needs per-locale status in one call.
      const rows = (await strapi.db.query(NAVIGATION_UID).findMany({
        select: ["documentId", "name", "slug", "visible", "locale", "publishedAt", "updatedAt"],
      })) as {
        documentId: string;
        name: string;
        slug: string;
        visible: boolean;
        locale?: string;
        publishedAt?: string | null;
        updatedAt?: string;
      }[];
      const grouped = new Map<string, { documentId: string; name: string; slug: string; visible: boolean; locales: Record<string, { hasDraft: boolean; hasPublished: boolean; updatedAt?: string }> }>();
      for (const row of rows) {
        const nav =
          grouped.get(row.documentId) ??
          grouped
            .set(row.documentId, {
              documentId: row.documentId,
              name: row.name,
              slug: row.slug,
              visible: row.visible,
              locales: {},
            })
            .get(row.documentId)!;
        const locale = row.locale ?? "";
        const entry = (nav.locales[locale] ??= { hasDraft: false, hasPublished: false });
        if (row.publishedAt) entry.hasPublished = true;
        else {
          entry.hasDraft = true;
          entry.updatedAt = row.updatedAt;
        }
      }
      ctx.body = { navigations: [...grouped.values()] };
    },

    async get(ctx: Ctx) {
      const doc = (await strapi.documents(NAVIGATION_UID as never).findOne({
        documentId: ctx.params.documentId,
        locale: ctx.query.locale,
        status: "draft",
      } as never)) as unknown as Record<string, unknown> | null;
      if (!doc) ctx.throw(404, "Navigation not found in this locale");
      ctx.body = doc;
    },

    async create(ctx: { request: { body: { name?: string; slug?: string; locale?: string } }; body: unknown; throw: (s: number, m: string) => never }) {
      const { name, slug, locale } = ctx.request.body ?? {};
      if (!name?.trim() || !slug?.trim()) ctx.throw(400, "name and slug are required");
      const doc = await strapi.documents(NAVIGATION_UID as never).create({
        data: { name, slug, visible: true, items: [] } as never,
        ...(locale ? { locale } : {}),
      } as never);
      ctx.body = doc;
    },

    async update(ctx: { params: Record<string, string>; query: Record<string, string | undefined>; request: { body: { name?: string; visible?: boolean; items?: unknown; updatedAt?: string } }; body: unknown; throw: (s: number, m: string) => never }) {
      const { documentId } = ctx.params;
      const locale = ctx.query.locale;
      const body = ctx.request.body ?? {};

      const current = (await strapi.documents(NAVIGATION_UID as never).findOne({
        documentId,
        locale,
        status: "draft",
      } as never)) as unknown as { updatedAt?: string } | null;

      // Optimistic concurrency: the whole tree is one value, so a stale save
      // would silently clobber a colleague's work. 409 lets the admin decide.
      if (current && body.updatedAt && current.updatedAt !== body.updatedAt) {
        ctx.throw(409, "Navigation was modified by someone else");
      }

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.visible !== undefined) data.visible = body.visible;
      if (body.items !== undefined) {
        const fieldDefs = await getFieldDefs(strapi);
        const maxDepth = strapi.plugin("mega-nav").config("maxDepth", 4) as number;
        const problems = validateTree(body.items, fieldDefs, { maxDepth });
        if (problems.length) {
          throw new errors.ValidationError(`Invalid navigation tree — ${problems[0]}`, { problems });
        }
        data.items = body.items;
      }

      const doc = await strapi.documents(NAVIGATION_UID as never).update({
        documentId,
        locale,
        data: data as never,
      } as never);
      ctx.body = doc;
    },

    async remove(ctx: Ctx) {
      await strapi.documents(NAVIGATION_UID as never).delete({ documentId: ctx.params.documentId } as never);
      ctx.body = { ok: true };
    },

    async publish(ctx: Ctx) {
      const doc = await strapi.documents(NAVIGATION_UID as never).publish({
        documentId: ctx.params.documentId,
        locale: ctx.query.locale,
      } as never);
      ctx.body = doc;
    },

    async copyLocale(ctx: { params: Record<string, string>; request: { body: { from?: string; to?: string; mode?: CopyMode } }; body: unknown; throw: (s: number, m: string) => never }) {
      const { from, to, mode } = ctx.request.body ?? {};
      if (!from || !to) ctx.throw(400, "from and to locales are required");
      try {
        ctx.body = await copyLocale(strapi, ctx.params.documentId, { from, to, mode });
      } catch (err) {
        ctx.throw(400, (err as Error).message);
      }
    },
  }),

  fields: ({ strapi }: { strapi: Core.Strapi }) => ({
    async get(ctx: { body: unknown }) {
      ctx.body = { fields: await getFieldDefs(strapi) };
    },
    async update(ctx: { request: { body: { fields?: FieldDef[] } }; body: unknown; throw: (s: number, m: string) => never }) {
      try {
        await setFieldDefs(strapi, ctx.request.body?.fields ?? []);
      } catch (err) {
        ctx.throw(400, (err as Error).message);
      }
      ctx.body = { fields: await getFieldDefs(strapi) };
    },
    async purge(ctx: { params: Record<string, string>; body: unknown }) {
      const result = await purgeField(strapi, ctx.params.name);
      cacheClear(); // rows were patched via the db layer — the middleware can't see it
      ctx.body = { ...result, fields: await getFieldDefs(strapi) };
    },
  }),

  layouts: ({ strapi }: { strapi: Core.Strapi }) => ({
    async get(ctx: { body: unknown }) {
      ctx.body = { layouts: await getLayoutSpecs(strapi) };
    },
    async update(ctx: { request: { body: { layouts?: LayoutSpec[] } }; body: unknown; throw: (s: number, m: string) => never }) {
      try {
        await setLayoutSpecs(strapi, ctx.request.body?.layouts ?? []);
      } catch (err) {
        ctx.throw(400, (err as Error).message);
      }
      ctx.body = { layouts: await getLayoutSpecs(strapi) };
    },
    async reset(ctx: { body: unknown }) {
      ctx.body = { layouts: await resetLayoutSpecs(strapi) };
    },
  }),

  sources: ({ strapi }: { strapi: Core.Strapi }) => ({
    async list(ctx: { body: unknown }) {
      ctx.body = {
        sources: getSources(strapi).map((s) => ({
          ...s,
          known: Boolean(strapi.contentTypes[s.uid as never]),
        })),
      };
    },
    async entries(ctx: Ctx) {
      const source = getSources(strapi).find((s) => s.uid === ctx.params.uid);
      if (!source) ctx.throw(404, `"${ctx.params.uid}" is not a configured source`);
      ctx.body = {
        entries: await searchEntries(strapi, source, {
          q: ctx.query.q,
          locale: ctx.query.locale,
        }),
      };
    },
    async resolve(ctx: { request: { body: { refs?: { uid: string; documentId: string }[]; locale?: string } }; body: unknown }) {
      const { refs = [], locale } = ctx.request.body ?? {};
      ctx.body = { refs: await resolveRefs(strapi, refs.slice(0, 500), locale) };
    },
  }),

  health: ({ strapi }: { strapi: Core.Strapi }) => ({
    async run(ctx: { body: unknown }) {
      ctx.body = { issues: await runHealthCheck(strapi) };
    },
  }),

  migration: ({ strapi }: { strapi: Core.Strapi }) => ({
    async scan(ctx: { request: { body: { overwrite?: boolean } }; body: unknown }) {
      ctx.body = await migrate(strapi, "scan", { overwrite: ctx.request.body?.overwrite });
    },
    async run(ctx: { request: { body: { overwrite?: boolean } }; body: unknown }) {
      ctx.body = await migrate(strapi, "run", { overwrite: ctx.request.body?.overwrite });
    },
  }),
};

const adminRoute = (method: string, path: string, handler: string, actions: string[]) => ({
  method,
  path,
  handler,
  config: {
    policies: [
      "admin::isAuthenticatedAdmin",
      { name: "admin::hasPermissions", config: { actions } },
    ],
  },
});

const routes = {
  "content-api": {
    type: "content-api",
    routes: [
      {
        method: "GET",
        path: "/render/:idOrSlug",
        handler: "render.render",
        // Menus are public site data; the render exposes only published
        // content unless a valid token asks for drafts.
        config: { auth: false, policies: [] },
      },
    ],
  },
  admin: {
    type: "admin",
    routes: [
      adminRoute("GET", "/navigations", "navigations.list", [ACTIONS.read]),
      adminRoute("POST", "/navigations", "navigations.create", [ACTIONS.update]),
      adminRoute("GET", "/navigations/:documentId", "navigations.get", [ACTIONS.read]),
      adminRoute("PUT", "/navigations/:documentId", "navigations.update", [ACTIONS.update]),
      adminRoute("DELETE", "/navigations/:documentId", "navigations.remove", [ACTIONS.update]),
      adminRoute("POST", "/navigations/:documentId/publish", "navigations.publish", [ACTIONS.update]),
      adminRoute("POST", "/navigations/:documentId/copy-locale", "navigations.copyLocale", [ACTIONS.update]),
      adminRoute("GET", "/fields", "fields.get", [ACTIONS.read]),
      adminRoute("PUT", "/fields", "fields.update", [ACTIONS.settings]),
      adminRoute("POST", "/fields/:name/purge", "fields.purge", [ACTIONS.settings]),
      adminRoute("GET", "/layouts", "layouts.get", [ACTIONS.read]),
      adminRoute("PUT", "/layouts", "layouts.update", [ACTIONS.settings]),
      adminRoute("POST", "/layouts/reset", "layouts.reset", [ACTIONS.settings]),
      adminRoute("GET", "/sources", "sources.list", [ACTIONS.read]),
      adminRoute("GET", "/sources/:uid/entries", "sources.entries", [ACTIONS.read]),
      adminRoute("POST", "/entries/resolve", "sources.resolve", [ACTIONS.read]),
      adminRoute("GET", "/health", "health.run", [ACTIONS.read]),
      adminRoute("POST", "/migration/scan", "migration.scan", [ACTIONS.migrate]),
      adminRoute("POST", "/migration/run", "migration.run", [ACTIONS.migrate]),
    ],
  },
};

export default {
  config,
  contentTypes,
  controllers,
  routes,

  register({ strapi }: { strapi: Core.Strapi }) {
    // Post-cutover convenience: serve the old plugin's public route so a
    // front that consumed strapi-plugin-navigation needs zero URL change.
    if (strapi.plugin("mega-nav").config("claimLegacyRoute", false)) {
      strapi.server.routes([
        {
          method: "GET",
          path: "/api/navigation/render/:idOrSlug",
          handler: async (ctx: Ctx) => {
            const payload = await renderNavigation(strapi, ctx.params.idOrSlug, {
              locale: ctx.query.locale,
              status: "published",
              format: "v1",
            });
            if (!payload) ctx.throw(404, "Navigation not found");
            ctx.body = payload;
          },
          config: { auth: false },
        } as never,
      ]);
    }
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await strapi.service("admin::permission").actionProvider.registerMany([
      { section: "plugins", displayName: "Read navigations", uid: "read", pluginName: "mega-nav" },
      { section: "plugins", displayName: "Edit and publish navigations", uid: "update", pluginName: "mega-nav" },
      { section: "plugins", displayName: "Manage fields and layouts", uid: "settings", pluginName: "mega-nav" },
      { section: "plugins", displayName: "Run the migration", uid: "migrate", pluginName: "mega-nav" },
    ]);

    await seedFieldDefs(strapi);
    await seedLayoutSpecs(strapi);

    const sourceUids = getSources(strapi).map((s) => s.uid);
    strapi.documents.use(makeInvalidationMiddleware(watchedUids(strapi, sourceUids)));
  },
};
