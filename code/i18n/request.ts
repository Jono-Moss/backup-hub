import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from "@/lib/i18n/locales";

// Which language this request is shown in (next-intl, without locale URLs):
//   1. the signed-in user's choice on their Account page;
//   2. otherwise the language cookie (remembers that choice on the sign-in
//      pages, after signing out);
//   3. otherwise the browser's preferred languages (Accept-Language);
//   4. otherwise English.
async function resolveLocale(): Promise<Locale> {
  const user = await getCurrentUser().catch(() => null);
  if (isLocale(user?.locale)) return user.locale;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return negotiateLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../translations/${locale}.json`)).default,
  };
});
