import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS } from "../fields";
import { normalizeAll } from "../migration/normalize";
import type { OldTables } from "../migration/read";

/**
 * Probe against a REAL strapi-plugin-navigation dataset, extracted to JSON:
 *
 *   MEGANAV_REAL_DATA=/path/to/dir npx vitest run normalize.realdata
 *
 * expects navigations.json, items.json, masters.json, parents.json and
 * related.json (pre-resolved morph targets: navigation_item_id, related_type,
 * document_id). Skipped when the variable is unset — CI stays hermetic.
 */

const dir = process.env.MEGANAV_REAL_DATA;

describe.skipIf(!dir)("normalizeAll on real data", () => {
  const load = <T>(file: string): T =>
    JSON.parse(fs.readFileSync(path.join(dir!, file), "utf8")) as T;

  it("converts every navigation without losing an item", () => {
    const relatedRows = load<{ navigation_item_id: number; related_type: string; document_id: string }[]>(
      "related.json",
    );
    const related: OldTables["related"] = {};
    for (const row of relatedRows) {
      const list = (related[row.navigation_item_id] ??= []);
      if (!list.some((r) => r.uid === row.related_type && r.documentId === row.document_id)) {
        list.push({ uid: row.related_type, documentId: row.document_id });
      }
    }

    const tables: OldTables = {
      navigations: load("navigations.json"),
      items: load("items.json"),
      masters: load("masters.json"),
      parents: load("parents.json"),
      related,
    };

    const navigations = normalizeAll(tables, [{ uid: "api::page.page", pattern: "/{path}" }], DEFAULT_FIELDS, {
      defaultLocale: "fr",
    });

    const totalConverted = navigations.reduce(
      (sum, nav) => sum + Object.values(nav.reports).reduce((s, r) => s + r.items, 0),
      0,
    );
    expect(totalConverted).toBe(tables.masters.length);

    for (const nav of navigations) {
      for (const [locale, report] of Object.entries(nav.reports)) {
        // Draft/published morph duplicates must be invisible: at most ONE
        // internal target per item.
        expect(report.links.internal).toBeLessThanOrEqual(report.items);
        // eslint-disable-next-line no-console
        console.log(
          `[real] ${nav.slug} ${locale}: ${report.items} items — links ${JSON.stringify(report.links)}, unknown keys ${JSON.stringify(report.unknownFieldKeys)}, media ${report.mediaDecoded} ok / ${report.mediaUnreadable} unreadable, unpaired ${report.unpaired}`,
        );
      }
    }
  });
});
