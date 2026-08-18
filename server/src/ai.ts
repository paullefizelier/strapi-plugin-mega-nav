import type { Core } from "@strapi/strapi";

/**
 * Machine translation, provider-agnostic.
 *
 * The key is stored server-side in the plugin store and never returned to the
 * browser — the admin only learns whether one is set, where it came from and
 * its last four characters. Resolution order, first match wins: saved in the
 * admin, then `config/plugins.ts`, then the environment.
 *
 * Translation is a single batched call: menus hold dozens of short strings, and
 * one request per item would be slow, expensive, and would translate each label
 * without the context of its siblings.
 */

export type AiProvider = "google" | "openai" | "anthropic" | "mistral";

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey?: string;
}

export interface PublicAiSettings {
  provider: AiProvider;
  model: string;
  configured: boolean;
  keySource: "settings" | "config" | "env" | null;
  hint: string;
}

const DEFAULT_MODELS: Record<AiProvider, string> = {
  google: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  mistral: "mistral-small-latest",
};

const ENV_KEYS: Record<AiProvider, string[]> = {
  google: ["MEGA_NAV_AI_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openai: ["MEGA_NAV_AI_KEY", "OPENAI_API_KEY"],
  anthropic: ["MEGA_NAV_AI_KEY", "ANTHROPIC_API_KEY"],
  mistral: ["MEGA_NAV_AI_KEY", "MISTRAL_API_KEY"],
};

const PROVIDERS = new Set<AiProvider>(["google", "openai", "anthropic", "mistral"]);

const store = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "mega-nav" });

async function stored(strapi: Core.Strapi): Promise<Partial<AiSettings>> {
  return ((await store(strapi).get({ key: "ai" })) as Partial<AiSettings> | null) ?? {};
}

export async function setAiSettings(
  strapi: Core.Strapi,
  input: { provider?: string; model?: string; apiKey?: string | null },
): Promise<void> {
  const current = await stored(strapi);
  const provider = (
    PROVIDERS.has(input.provider as AiProvider) ? input.provider : current.provider ?? "google"
  ) as AiProvider;
  const next: Partial<AiSettings> = {
    provider,
    model: (input.model ?? current.model ?? DEFAULT_MODELS[provider]).trim(),
  };
  // An absent key keeps the stored one; an explicitly empty one clears it.
  if (input.apiKey === null || input.apiKey === "") delete next.apiKey;
  else if (input.apiKey) next.apiKey = input.apiKey.trim();
  else if (current.apiKey) next.apiKey = current.apiKey;
  await store(strapi).set({ key: "ai", value: next });
}

export async function resolveAi(
  strapi: Core.Strapi,
): Promise<AiSettings & { keySource: PublicAiSettings["keySource"] }> {
  const saved = await stored(strapi);
  const fromConfig = (strapi.plugin("mega-nav").config("ai", {}) ?? {}) as Partial<AiSettings>;
  const provider = (saved.provider ?? fromConfig.provider ?? "google") as AiProvider;
  const model = saved.model || fromConfig.model || DEFAULT_MODELS[provider];

  if (saved.apiKey) return { provider, model, apiKey: saved.apiKey, keySource: "settings" };
  if (fromConfig.apiKey) return { provider, model, apiKey: fromConfig.apiKey, keySource: "config" };
  for (const name of ENV_KEYS[provider]) {
    if (process.env[name]) return { provider, model, apiKey: process.env[name], keySource: "env" };
  }
  return { provider, model, keySource: null };
}

export async function publicAiSettings(strapi: Core.Strapi): Promise<PublicAiSettings> {
  const { provider, model, apiKey, keySource } = await resolveAi(strapi);
  return {
    provider,
    model,
    configured: Boolean(apiKey),
    keySource,
    hint: apiKey ? `…${apiKey.slice(-4)}` : "",
  };
}

const SYSTEM = [
  "You translate user-interface labels for a website navigation menu.",
  "You are given a JSON array of strings. Answer with a JSON array of the same",
  "length, in the same order, holding the translations and nothing else.",
  "Keep the register short and menu-like; do not add punctuation that was not",
  "there. Leave brand names, product names and proper nouns untranslated.",
].join(" ");

const userPrompt = (texts: string[], from: string, to: string) =>
  `Translate from "${from}" to "${to}". Answer with a JSON array of ${texts.length} strings.\n\n${JSON.stringify(texts, null, 0)}`;

/** Pull the first JSON array out of a model answer, fenced or not. */
export function parseArrayAnswer(raw: string, expected: number): (string | undefined)[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return new Array(expected).fill(undefined);
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return new Array(expected).fill(undefined);
    return Array.from({ length: expected }, (_, i) =>
      typeof parsed[i] === "string" ? (parsed[i] as string) : undefined,
    );
  } catch {
    return new Array(expected).fill(undefined);
  }
}

async function callProvider(
  { provider, model, apiKey }: AiSettings,
  system: string,
  user: string,
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "Machine translation is not configured — add a provider key under Settings → Mega Nav → Translation",
    );
  }

  if (provider === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(body.error?.message || `Google ${res.status}`);
    return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const body = (await res.json()) as {
      content?: { text?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(body.error?.message || `Anthropic ${res.status}`);
    return body.content?.map((c) => c.text ?? "").join("") ?? "";
  }

  // OpenAI and Mistral share the chat-completions shape.
  const url =
    provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.mistral.ai/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message || `${provider} ${res.status}`);
  return body.choices?.[0]?.message?.content ?? "";
}

/** One call for the whole menu; answers are positional. */
export async function translateBatch(
  strapi: Core.Strapi,
  texts: string[],
  from: string,
  to: string,
): Promise<(string | undefined)[]> {
  if (!texts.length) return [];
  const settings = await resolveAi(strapi);
  const raw = await callProvider(settings, SYSTEM, userPrompt(texts, from, to));
  return parseArrayAnswer(raw, texts.length);
}

/** Round-trips a single word so the admin can prove the credentials work. */
export async function testAi(strapi: Core.Strapi): Promise<{ ok: boolean; sample?: string; error?: string }> {
  try {
    const [sample] = await translateBatch(strapi, ["Contact us"], "en", "fr");
    return sample ? { ok: true, sample } : { ok: false, error: "The provider answered nothing usable" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
