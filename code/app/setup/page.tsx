import { ActionForm } from "@/components/ui/common/ActionForm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasAnyUsers } from "@/lib/auth/session";
import { createFirstAdmin } from "./actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

export default async function SetupPage() {
  // Once any user exists, this page is no longer reachable — go to /login.
  if (await hasAnyUsers()) {
    redirect("/login");
  }
  const t = await getTranslations("auth");

  return (
    <div className="flex items-center justify-center bg-paper">
      <div className="w-full max-w-sm border border-line bg-white p-8">
        <h1 className="text-lg font-semibold text-ink mb-1">{t("setupTitle")}</h1>
        <p className="text-sm text-muted mb-6">{t("setupSubtitle")}</p>

        <ActionForm action={createFirstAdmin} className="space-y-4">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              {t("yourName")}
            </label>
            <input
              id="name"
              name="name"
              required
              autoFocus
              className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="email">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="password">
              {t("password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted mt-1">{t("passwordHint")}</p>
          </div>
          <StandardSubmitButton title={t("createAdmin")} />
        </ActionForm>
      </div>
    </div>
  );
}
