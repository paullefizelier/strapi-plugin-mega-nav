import type { Core } from "@strapi/strapi";

/**
 * In-process render cache. Menus are tiny, so invalidation is a FULL bust on
 * any write touching what a render can read: the navigation itself, any
 * `sources` content type, or an upload. Simpler and provably correct versus
 * per-key dependency tracking — a documented non-goal.
 */

interface Entry {
  at: number;
  value: unknown;
}

const cache = new Map<string, Entry>();

export const cacheKey = (parts: (string | undefined)[]): string => parts.map((p) => p ?? "").join("|");

export function cacheGet<T>(key: string, ttlMs: number): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown): void {
  cache.set(key, { at: Date.now(), value });
}

export function cacheClear(): void {
  cache.clear();
}

const WRITE_ACTIONS = new Set(["create", "update", "delete", "publish", "unpublish", "discardDraft", "clone"]);

/**
 * Document-service middleware busting the cache on any relevant write.
 * Registered once at bootstrap with the set of uids a render can depend on.
 */
export function makeInvalidationMiddleware(watchedUids: Set<string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (context: { action: string; uid: string }, next: () => any): Promise<any> => {
    const result = await next();
    if (WRITE_ACTIONS.has(context.action) && watchedUids.has(context.uid)) {
      cacheClear();
    }
    return result;
  };
}

/** The uids whose writes can change a rendered menu. */
export function watchedUids(strapi: Core.Strapi, sourceUids: string[]): Set<string> {
  void strapi;
  return new Set(["plugin::mega-nav.navigation", "plugin::upload.file", ...sourceUids]);
}
