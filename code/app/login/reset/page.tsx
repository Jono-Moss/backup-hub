import type { Metadata } from "next";
import Link from "next/link";
import { resetPassword } from "./actions";
import { findResetToken } from "@/lib/auth/password-reset";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

export const dynamic = "force-dynamic";

// The token is in the URL — never send it on to another site as a Referer.
export const metadata: Metadata = { referrer: "no-referrer" };

const ERRORS: Record<string, string> = {
  mismatch: "The two passwords didn't match.",
  weak: "Use at least 8 characters.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const valid = error !== "invalid" && (await findResetToken(token));

  return (
    <div className="flex items-center justify-center bg-paper">
      <div className="rounded-md w-full max-w-sm border border-line bg-white p-8">
        <h1 className="text-lg font-semibold text-ink mb-1">Choose a new password</h1>

        {!valid ? (
          <>
            <p className="mt-4 text-sm text-danger bg-danger-light px-3 py-2">
              This reset link is invalid, has expired, or was already used.
            </p>
            <Link href="/login/forgot" className="mt-6 inline-block text-sm text-primary hover:underline">
              Send a new link
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-muted mb-6">
              For {valid.email}. You&apos;ll be signed out everywhere, and if you use an authenticator app you&apos;ll
              still need it to sign in.
            </p>
            {error && ERRORS[error] && (
              <p className="mb-4 text-sm text-danger bg-danger-light px-3 py-2">{ERRORS[error]}</p>
            )}
            <form action={resetPassword} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label className="block text-sm text-ink mb-1" htmlFor="password">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-ink mb-1" htmlFor="confirm">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <StandardSubmitButton title="Set new password" pendingTitle="Saving..." fullWidth />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
