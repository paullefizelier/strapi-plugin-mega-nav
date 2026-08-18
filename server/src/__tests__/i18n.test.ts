import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core } from "@strapi/strapi";
import { copyLocale, mergeTrees } from "../i18n";
import type { NavNode } from "../tree";

const node = (title: string, partial: Partial<NavNode> = {}): NavNode => ({
  id: `id-${title}`,
  title,
  link: { kind: "none" },
  fields: {},
  children: [],
  ...partial,
});

/**
 * A strapi mock exposing the two locale variants of one navigation, plus the
 * store (field defs) and the sources config the translate mode reads.
 */
function makeStrapi(byLocale: Record<string, NavNode[] | undefined>) {
  const saved: { locale?: string; items?: NavNode[] }[] = [];
  const documents = () => ({
    findOne: async ({ locale }: { locale: string }) =>
      byLocale[locale] ? { items: byLocale[locale] } : null,
    findMany: async () => [],
    update: async ({ locale, data }: { locale: string; data: { items: NavNode[] } }) => {
      saved.push({ locale, items: data.items });
      byLocale[locale] = data.items;
      return { documentId: "doc" };
    },
  });
  const strapi = {
    documents,
    store: () => ({ get: async () => null, set: async () => {} }),
    plugin: () => ({ config: (key: string, def: unknown) => (key === "sources" ? [] : def) }),
    log: { warn: vi.fn(), error: vi.fn() },
  } as unknown as Core.Strapi;
  return { strapi, saved };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("mergeTrees", () => {
  it("takes the source shape and keeps the target's own text on paired ids", () => {
    const source = [node("Trouver un job", { children: [node("Par secteur")] })];
    const target = [
      node("Find a job", { id: "id-Trouver un job", children: [node("By sector", { id: "id-Par secteur" })] }),
    ];
    const merged = mergeTrees(source, target);
    expect(merged[0].title).toBe("Find a job");
    expect(merged[0].children[0].title).toBe("By sector");
    expect(merged[0].id).toBe(source[0].id);
  });

  it("brings a node the target does not have, with the source text", () => {
    const source = [node("A"), node("B")];
    const merged = mergeTrees(source, [node("A translated", { id: "id-A" })]);
    expect(merged.map((n) => n.title)).toEqual(["A translated", "B"]);
  });
});

describe("copyLocale", () => {
  it("refuses two identical or missing locales", async () => {
    const { strapi } = makeStrapi({ fr: [] });
    await expect(copyLocale(strapi, "doc", { from: "fr", to: "fr" })).rejects.toThrow("distinct");
    await expect(copyLocale(strapi, "doc", { from: "", to: "en" })).rejects.toThrow("distinct");
  });

  it("fails clearly when the source locale does not exist", async () => {
    const { strapi } = makeStrapi({ en: [] });
    await expect(copyLocale(strapi, "doc", { from: "fr", to: "en" })).rejects.toThrow('no "fr" locale');
  });

  it("full mode overwrites the target with the source", async () => {
    const { strapi, saved } = makeStrapi({
      fr: [node("Accueil", { children: [node("Contact")] })],
      en: [node("Home", { id: "id-Accueil" })],
    });
    const result = await copyLocale(strapi, "doc", { from: "fr", to: "en", mode: "full" });
    expect(result.items).toBe(2);
    expect(saved[0].locale).toBe("en");
    expect(saved[0].items?.[0].title).toBe("Accueil");
  });

  it("structure mode keeps the translations already on the target", async () => {
    const { strapi, saved } = makeStrapi({
      fr: [node("Accueil", { children: [node("Contact")] })],
      en: [node("Home", { id: "id-Accueil" })],
    });
    const result = await copyLocale(strapi, "doc", { from: "fr", to: "en", mode: "structure" });
    expect(saved[0].items?.[0].title).toBe("Home");
    expect(saved[0].items?.[0].children[0].title).toBe("Contact"); // new node, source text
    expect(result.kept).toBe(1);
  });

  it("translate mode rewrites the prose and reports what it did", async () => {
    // The provider answers a JSON array, in order.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '["Home","Contact us"]' }] } }],
        }),
      })),
    );
    const { strapi, saved } = makeStrapi({
      fr: [node("Accueil", { children: [node("Contactez-nous")] })],
      en: undefined,
    });
    // A key has to resolve for the call to happen.
    vi.stubEnv?.("MEGA_NAV_AI_KEY", "test-key");
    process.env.MEGA_NAV_AI_KEY = "test-key";

    const result = await copyLocale(strapi, "doc", { from: "fr", to: "en", mode: "translate" });

    expect(saved[0].items?.[0].title).toBe("Home");
    expect(saved[0].items?.[0].children[0].title).toBe("Contact us");
    expect(result.translated).toBe(2);
    expect(result.untranslated).toBe(0);
    delete process.env.MEGA_NAV_AI_KEY;
  });

  it("translate mode leaves the source text when the provider answers nothing usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "sorry, no" }] } }] }),
      })),
    );
    const { strapi, saved } = makeStrapi({ fr: [node("Accueil")], en: undefined });
    process.env.MEGA_NAV_AI_KEY = "test-key";

    const result = await copyLocale(strapi, "doc", { from: "fr", to: "en", mode: "translate" });

    expect(saved[0].items?.[0].title).toBe("Accueil");
    expect(result.translated).toBe(0);
    expect(result.untranslated).toBe(1);
    delete process.env.MEGA_NAV_AI_KEY;
  });
});
