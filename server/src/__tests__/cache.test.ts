import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheClear,
  cacheGet,
  cacheKey,
  cacheSet,
  makeInvalidationMiddleware,
} from "../cache";

afterEach(() => {
  cacheClear();
  vi.useRealTimers();
});

describe("TTL cache", () => {
  it("serves within the TTL and expires after", () => {
    vi.useFakeTimers();
    const key = cacheKey(["render", "nav", "fr", "published", "v1"]);
    cacheSet(key, [{ id: 1 }]);
    expect(cacheGet(key, 60_000)).toEqual([{ id: 1 }]);
    vi.advanceTimersByTime(61_000);
    expect(cacheGet(key, 60_000)).toBeUndefined();
  });

  it("keys undefined parts stably", () => {
    expect(cacheKey(["a", undefined, "b"])).toBe(cacheKey(["a", "", "b"]));
  });
});

describe("invalidation middleware", () => {
  const watched = new Set(["plugin::mega-nav.navigation", "api::page.page"]);

  it("busts the whole cache on a write to a watched uid", async () => {
    cacheSet("k", 1);
    const middleware = makeInvalidationMiddleware(watched);
    await middleware({ action: "update", uid: "api::page.page" }, async () => "ok");
    expect(cacheGet("k", 60_000)).toBeUndefined();
  });

  it("busts on publish of the navigation itself", async () => {
    cacheSet("k", 1);
    const middleware = makeInvalidationMiddleware(watched);
    await middleware({ action: "publish", uid: "plugin::mega-nav.navigation" }, async () => "ok");
    expect(cacheGet("k", 60_000)).toBeUndefined();
  });

  it("ignores reads and unwatched content types", async () => {
    cacheSet("k", 1);
    const middleware = makeInvalidationMiddleware(watched);
    await middleware({ action: "findMany", uid: "api::page.page" }, async () => "ok");
    await middleware({ action: "update", uid: "api::other.other" }, async () => "ok");
    expect(cacheGet("k", 60_000)).toBe(1);
  });

  it("passes next()'s result through and busts only AFTER the write landed", async () => {
    const middleware = makeInvalidationMiddleware(watched);
    let busted = false;
    cacheSet("k", 1);
    const result = await middleware({ action: "update", uid: "api::page.page" }, async () => {
      busted = cacheGet("k", 60_000) === undefined;
      return "saved";
    });
    expect(result).toBe("saved");
    expect(busted).toBe(false); // still cached during the write
    expect(cacheGet("k", 60_000)).toBeUndefined(); // busted after
  });
});
