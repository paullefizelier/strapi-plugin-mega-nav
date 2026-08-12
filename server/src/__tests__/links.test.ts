import { describe, expect, it } from "vitest";
import { patternTokens, renderPattern, reverseMatch, splitTarget } from "../links";

describe("renderPattern", () => {
  it("builds an URL from entry fields", () => {
    expect(renderPattern("/actualites/{slug}", { slug: "mon-article" })).toBe("/actualites/mon-article");
  });

  it("supports {locale} and multiple tokens", () => {
    expect(renderPattern("/{locale}/jobs/{slug}", { slug: "cariste" }, "en")).toBe("/en/jobs/cariste");
  });

  it("returns null when a token is missing — the item must degrade, not 404", () => {
    expect(renderPattern("/actualites/{slug}", {})).toBeNull();
    expect(renderPattern("/actualites/{slug}", { slug: "" })).toBeNull();
  });

  it("collapses doubled slashes when a token holds a full path", () => {
    expect(renderPattern("/{path}", { path: "/entreprises/besoins" })).toBe("/entreprises/besoins");
  });
});

describe("reverseMatch", () => {
  const sources = [
    { uid: "api::article.article", pattern: "/actualites/{slug}" },
    { uid: "api::page.page", pattern: "/{path}" },
  ];

  it("recognises a relative path as an entry of a source", () => {
    expect(reverseMatch("/actualites/mon-article", sources)).toEqual({
      uid: "api::article.article",
      where: { slug: "mon-article" },
      query: undefined,
      hash: undefined,
    });
  });

  it("tolerates a trailing slash and preserves query and hash", () => {
    const match = reverseMatch("/actualites/mon-article/?utm=x#section", sources);
    expect(match).toMatchObject({
      uid: "api::article.article",
      where: { slug: "mon-article" },
      query: "utm=x",
      hash: "section",
    });
  });

  it("falls through to the catch-all pattern in declaration order", () => {
    expect(reverseMatch("/entreprises/besoins", sources)).toMatchObject({
      uid: "api::page.page",
      where: { path: "entreprises/besoins" },
    });
  });

  it("returns null for absolute URLs and unmatched paths", () => {
    expect(reverseMatch("https://example.com/actualites/x", sources)).toBeNull();
    expect(reverseMatch("/nope", [{ uid: "a", pattern: "/fixed/{slug}" }])).toBeNull();
  });

  it("skips sources without a pattern", () => {
    expect(reverseMatch("/x", [{ uid: "a" }])).toBeNull();
  });
});

describe("splitTarget / patternTokens", () => {
  it("splits path, query and hash", () => {
    expect(splitTarget("/jobs?family=Manutention#top")).toEqual({
      path: "/jobs",
      query: "family=Manutention",
      hash: "top",
    });
    expect(splitTarget("/jobs")).toEqual({ path: "/jobs", query: undefined, hash: undefined });
  });

  it("lists entry tokens, excluding locale", () => {
    expect(patternTokens("/{locale}/agences/{slug}/{city}")).toEqual(["slug", "city"]);
  });
});
