// Interface languages. English is the default and the source text: every
// other translations/<locale>.json has the same keys as translations/en.json.
// To add a language, add it here and add its messages file.

export const LOCALES = ["en", "es", "de", "fr", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language's name in its own language, for the picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  zh: "简体中文",
};

/** Remembers the chosen language for the sign-in pages too (set when a user saves one). */
export const LOCALE_COOKIE = "bh_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best supported language from an Accept-Language header, e.g.
 * "de-CH,de;q=0.9,en;q=0.8" → "de". Matches on the base language only.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.base).find(isLocale) ?? null;
}
