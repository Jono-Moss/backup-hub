import { getTranslations } from "next-intl/server";
import { buildScopes, type ScopesT } from "./scopeOptions";

/** Permission names for async server components. */
export async function getScopes() {
  return buildScopes((await getTranslations("scopes")) as unknown as ScopesT);
}
