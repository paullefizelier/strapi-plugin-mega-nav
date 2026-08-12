import { useFetchClient } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "./pluginId";
import type {
  EntryHit,
  FieldDef,
  LayoutSpec,
  NavigationDoc,
  NavigationSummary,
  NavNode,
  ResolvedRef,
  SourceInfo,
} from "./types";

/** Thin, typed wrappers over the plugin's admin API. */
export function useMegaNavApi() {
  const { get, post, put, del } = useFetchClient();
  const base = `/${PLUGIN_ID}`;

  return {
    async listNavigations(): Promise<NavigationSummary[]> {
      const { data } = await get<{ navigations: NavigationSummary[] }>(`${base}/navigations`);
      return data.navigations;
    },
    async getNavigation(documentId: string, locale: string): Promise<NavigationDoc> {
      const { data } = await get<NavigationDoc>(`${base}/navigations/${documentId}`, {
        params: { locale },
      });
      return data;
    },
    async createNavigation(input: { name: string; slug: string; locale?: string }): Promise<NavigationDoc> {
      const { data } = await post<NavigationDoc>(`${base}/navigations`, input);
      return data;
    },
    async saveNavigation(
      documentId: string,
      locale: string,
      body: { name?: string; visible?: boolean; items: NavNode[]; updatedAt?: string },
    ): Promise<NavigationDoc> {
      const { data } = await put<NavigationDoc>(`${base}/navigations/${documentId}`, body, {
        params: { locale },
      });
      return data;
    },
    async deleteNavigation(documentId: string): Promise<void> {
      await del(`${base}/navigations/${documentId}`);
    },
    async publishNavigation(documentId: string, locale: string): Promise<void> {
      await post(`${base}/navigations/${documentId}/publish`, undefined, { params: { locale } });
    },
    async copyLocale(
      documentId: string,
      body: { from: string; to: string; mode: "full" | "structure" },
    ): Promise<{ items: number; kept: number }> {
      const { data } = await post<{ items: number; kept: number }>(
        `${base}/navigations/${documentId}/copy-locale`,
        body,
      );
      return data;
    },
    async getFields(): Promise<FieldDef[]> {
      const { data } = await get<{ fields: FieldDef[] }>(`${base}/fields`);
      return data.fields;
    },
    async getLayouts(): Promise<LayoutSpec[]> {
      const { data } = await get<{ layouts: LayoutSpec[] }>(`${base}/layouts`);
      return data.layouts;
    },
    async getSources(): Promise<SourceInfo[]> {
      const { data } = await get<{ sources: SourceInfo[] }>(`${base}/sources`);
      return data.sources;
    },
    async searchEntries(uid: string, q: string, locale: string): Promise<EntryHit[]> {
      const { data } = await get<{ entries: EntryHit[] }>(
        `${base}/sources/${encodeURIComponent(uid)}/entries`,
        { params: { q, locale } },
      );
      return data.entries;
    },
    async resolveRefs(
      refs: { uid: string; documentId: string }[],
      locale: string,
    ): Promise<ResolvedRef[]> {
      if (!refs.length) return [];
      const { data } = await post<{ refs: ResolvedRef[] }>(`${base}/entries/resolve`, {
        refs,
        locale,
      });
      return data.refs;
    },
  };
}
