/**
 * URL patterns for internal links — pure helpers.
 *
 * A source declares how its entries turn into URLs: `pattern: "/articles/{slug}"`
 * (tokens read the resolved entry; `{locale}` reads the requested locale).
 * The same pattern runs both ways: forward to build an href at render time,
 * and BACKWARD (reverseMatch) so the migration can recognise the old plugin's
 * "external link with a relative path" workaround as a real internal link.
 */

const TOKEN_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Field names a pattern reads from the entry (locale excluded — it's contextual). */
export function patternTokens(pattern: string): string[] {
  const tokens = new Set<string>();
  for (const match of pattern.matchAll(TOKEN_RE)) {
    if (match[1] !== "locale") tokens.add(match[1]);
  }
  return [...tokens];
}

/**
 * Build the URL of an entry, or null when a token has no usable value — a
 * null href means the link cannot be rendered and the item degrades.
 */
export function renderPattern(
  pattern: string,
  entry: Record<string, unknown>,
  locale?: string,
): string | null {
  let missing = false;
  const path = pattern.replace(TOKEN_RE, (_all, token: string) => {
    const value = token === "locale" ? locale : entry?.[token];
    if (value === null || value === undefined || value === "") {
      missing = true;
      return "";
    }
    return String(value);
  });
  if (missing) return null;
  // A pattern token may itself hold a full path ("/entreprises/besoins") —
  // collapse any doubled slashes that concatenation produced.
  return path.replace(/\/{2,}/g, "/");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pattern as a regex with one named group per token. */
export function patternToRegex(pattern: string): RegExp {
  let out = "";
  let last = 0;
  for (const match of pattern.matchAll(TOKEN_RE)) {
    out += escapeRe(pattern.slice(last, match.index));
    // `{locale}` matches a short code; entry tokens match anything non-empty.
    out += match[1] === "locale" ? "(?<locale>[a-zA-Z-]{2,5})" : `(?<${match[1]}>.+?)`;
    last = (match.index ?? 0) + match[0].length;
  }
  out += escapeRe(pattern.slice(last));
  return new RegExp(`^${out}/?$`);
}

export interface TargetParts {
  path: string;
  query?: string;
  hash?: string;
}

/** Split a stored target into path / query / hash. */
export function splitTarget(raw: string): TargetParts {
  let rest = raw.trim();
  let hash: string | undefined;
  let query: string | undefined;
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) {
    hash = rest.slice(hashAt + 1) || undefined;
    rest = rest.slice(0, hashAt);
  }
  const queryAt = rest.indexOf("?");
  if (queryAt >= 0) {
    query = rest.slice(queryAt + 1) || undefined;
    rest = rest.slice(0, queryAt);
  }
  return { path: rest, query, hash };
}

export function joinHref(path: string, query?: string, hash?: string): string {
  return `${path}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export interface ReverseMatch {
  uid: string;
  /** Token name → value extracted from the path (locale excluded). */
  where: Record<string, string>;
  query?: string;
  hash?: string;
}

/**
 * Recognise a relative path as an entry of one of the sources. Query string
 * and hash are preserved — they ride on the link, not on the entry.
 */
export function reverseMatch(
  raw: string,
  sources: { uid: string; pattern?: string }[],
): ReverseMatch | null {
  const { path, query, hash } = splitTarget(raw);
  if (!path.startsWith("/")) return null;
  for (const source of sources) {
    if (!source.pattern) continue;
    const match = path.match(patternToRegex(source.pattern));
    if (!match) continue;
    const where: Record<string, string> = {};
    for (const [token, value] of Object.entries(match.groups ?? {})) {
      if (token !== "locale" && value !== undefined) where[token] = value;
    }
    if (!Object.keys(where).length) continue; // nothing identifies an entry
    return { uid: source.uid, where, query, hash };
  }
  return null;
}
