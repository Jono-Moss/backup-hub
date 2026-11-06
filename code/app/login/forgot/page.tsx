import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { forgotPassword } from "./actions";
import { smtpConfigured } from "@/lib/auth/password-reset";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const canEmail = smtpConfigured();
  const t = await getTranslations("passwordReset");
  const tAuth = await getTranslations("auth");

  return (
    <div className="flex items-center justify-center bg-paper">
      <div className="rounded-md w-full max-w-sm border border-line bg-white p-8">
        <h1 className="text-lg font-semibold text-ink mb-1">{t("forgotTitle")}</h1>

        {!canEmail ? (
          <p className="text-sm text-muted mb-6">{t("noEmail")}</p>
        ) : sent ? (
          <p className="mb-6 text-sm text-ink bg-primary-light px-3 py-2">{t("sent")}</p>
        ) : (
          <>
            <p className="text-sm text-muted mb-6">{t("forgotIntro")}</p>
            <form action={forgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm text-ink mb-1" htmlFor="email">
                  {tAuth("email")}
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
              <StandardSubmitButton title={t("sendLink")} pendingTitle={t("sending")} fullWidth />
            </form>
          </>
        )}

        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </div>
    </div>
  );
}
