import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasAnyUsers } from "@/lib/auth/session";
import { login } from "./actions";
import { PasskeyLoginButton } from "@/components/ui/auth/PasskeyLoginButton";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; minutes?: string; reset?: string }>;
}) {
  // No users yet → this is a fresh install, send them to create the admin account.
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }

  const params = await searchParams;
  const t = await getTranslations("auth");
  const minutes = Number(params.minutes);
  const resetLink = (chunks: React.ReactNode) => (
    <Link href="/login/forgot" className="underline">
      {chunks}
    </Link>
  );
  return (
    <div className="flex items-center justify-center bg-paper">
      <div className="rounded-md w-full max-w-sm border border-line bg-white p-8">
        <h1 className="text-lg font-semibold text-ink mb-1">Backup Hub</h1>
        <p className="text-sm text-muted mb-6">{t("subtitle")}</p>

        {params.reset && !params.error && (
          <p className="mb-4 text-sm text-ink bg-primary-light px-3 py-2">
            {t("passwordChanged")}
          </p>
        )}

        {params.error === "locked" ? (
          <p className="mb-4 text-sm text-danger bg-danger-light px-3 py-2">
            {minutes > 0 ? t.rich("lockedOut", { minutes, link: resetLink }) : t.rich("lockedOutSoon", { link: resetLink })}
          </p>
        ) : (
          params.error && (
            <p className="mb-4 text-sm text-danger bg-danger-light px-3 py-2">
              {t("incorrect")}
            </p>
          )
        )}

        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="email">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-sm text-ink" htmlFor="password">
                {t("password")}
              </label>
              <Link href="/login/forgot" className="text-xs text-primary hover:underline">
                {t("forgotLink")}
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <StandardSubmitButton title={t("signIn")} fullWidth />
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">{t("or")}</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <PasskeyLoginButton next={params.next ?? "/"} />

      </div>
    </div>
  );
}
