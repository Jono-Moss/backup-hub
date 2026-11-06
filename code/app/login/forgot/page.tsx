import Link from "next/link";
import { forgotPassword } from "./actions";
import { smtpConfigured } from "@/lib/auth/password-reset";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const canEmail = smtpConfigured();

  return (
    <div className="flex items-center justify-center bg-paper">
      <div className="rounded-md w-full max-w-sm border border-line bg-white p-8">
        <h1 className="text-lg font-semibold text-ink mb-1">Forgot your password?</h1>

        {!canEmail ? (
          <p className="text-sm text-muted mb-6">
            Email isn&apos;t set up on this server, so reset links can&apos;t be sent. Ask an admin to set a new
            password for you from the Users page. If you can&apos;t sign in because of too many failed attempts, wait
            for the lockout to end, or sign in with a passkey.
          </p>
        ) : sent ? (
          <p className="mb-6 text-sm text-ink bg-primary-light px-3 py-2">
            If that email belongs to an account, a reset link is on its way. It works once and expires in 30 minutes —
            check your spam folder if it doesn&apos;t arrive.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted mb-6">
              Enter your account&apos;s email and we&apos;ll send you a link to choose a new password. Resetting also
              lifts a sign-in lockout.
            </p>
            <form action={forgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm text-ink mb-1" htmlFor="email">
                  Email
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
              <StandardSubmitButton title="Send reset link" pendingTitle="Sending..." fullWidth />
            </form>
          </>
        )}

        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
