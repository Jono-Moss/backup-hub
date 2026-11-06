import { useTranslations } from "next-intl";
import type { Scope } from "@/db/schema";

// Permissions for API keys and task sharing. Their names and hints are in
// translations/<locale>.json under "scopes.<scope with : as _>".
export const SCOPE_VALUES: Scope[] = ["tasks:read", "tasks:write", "runs:trigger", "runs:download", "runs:delete"];

const key = (scope: Scope) => scope.replace(":", "_") as "tasks_read";

export type ScopesT = (k: `${ReturnType<typeof key>}.${"label" | "hint"}`) => string;

export function buildScopes(t: ScopesT) {
  return {
    options: SCOPE_VALUES.map((value) => ({ value, label: t(`${key(value)}.label`), hint: t(`${key(value)}.hint`) })),
    label: (scope: Scope) => (SCOPE_VALUES.includes(scope) ? t(`${key(scope)}.label`) : scope),
  };
}

/** For client and non-async server components (async ones: scopeOptions.server.ts). */
export function useScopes() {
  return buildScopes(useTranslations("scopes") as unknown as ScopesT);
}
