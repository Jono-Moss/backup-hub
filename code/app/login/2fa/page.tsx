import { redirect } from "next/navigation";
import { getPendingTwoFactorUser } from "@/lib/auth/session";
import { verifyTwoFactorLogin, cancelTwoFactorLogin } from "./actions";

export default async function TwoFactorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const user = await getPendingTwoFactorUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const useRecoveryCode = params.mode === "recovery";

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="w-full max-w-sm border border-line bg-white p-8">
        <h1 className="text-lg font-semibold text-ink mb-1">Two-factor authentication</h1>
        <p className="text-sm text-muted mb-6">
          {useRecoveryCode
            ? "Enter one of your unused recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
        </p>

        {params.error && (
          <p className="mb-4 text-sm text-danger bg-danger-light px-3 py-2">
            {useRecoveryCode ? "That recovery code isn't valid or was already used." : "That code didn't match."}
          </p>
        )}

        <form action={verifyTwoFactorLogin} className="space-y-4">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <input type="hidden" name="mode" value={useRecoveryCode ? "recovery" : "totp"} />
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="code">
              {useRecoveryCode ? "Recovery code" : "Authentication code"}
            </label>
            <input
              id="code"
              name="code"
              required
              autoFocus
              autoComplete="one-time-code"
              placeholder={useRecoveryCode ? "XXXXX-XXXXX" : "123456"}
              className="w-full border border-line px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white text-sm font-medium py-2 transition-colors"
          >
            Verify
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <a
            href={`/login/2fa?next=${encodeURIComponent(params.next ?? "/")}${useRecoveryCode ? "" : "&mode=recovery"}`}
            className="text-primary hover:underline"
          >
            {useRecoveryCode ? "Use your authenticator app instead" : "Use a recovery code instead"}
          </a>
          <form action={cancelTwoFactorLogin}>
            <button type="submit" className="text-muted hover:text-danger">
              Cancel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
