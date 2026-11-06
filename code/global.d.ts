import type en from "./translations/en.json";
import type { Locale } from "./lib/i18n/locales";

// Typed translations: a key that isn't in translations/en.json is a type error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
