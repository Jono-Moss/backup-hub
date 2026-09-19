import { requireUser } from "@/lib/auth/session";
import { updateOwnProfile } from "@/app/users/actions";
import { getTotpStatus, listPasskeys } from "@/app/account/actions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { TotpEnrollFlow } from "@/components/ui/TotpEnrollFlow";
import { DisableTotpForm } from "@/components/ui/DisableTotpForm";
import { RegenerateRecoveryCodesButton } from "@/components/ui/RegenerateRecoveryCodesButton";
import { PasskeyManager } from "@/components/ui/PasskeyManager";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  const [totpStatus, passkeys] = await Promise.all([getTotpStatus(), listPasskeys()]);

  return (
    <div className="max-w-md space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Your account</h1>
        <p className="text-sm text-muted">{me.email}</p>
      </div>

      <StandardSection>
        <form action={updateOwnProfile} className="space-y-5">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={me.name}
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <hr className="border-line" />

          <p className="text-sm text-ink">Change password</p>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="currentPassword">
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              placeholder="Required only if setting a new password"
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="newPassword">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder="Leave blank to keep current password"
              minLength={8}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <StandardSubmitButton title="Save changes" />
        </form>
      </StandardSection>

      <StandardSection>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-ink">Two-factor authentication</h2>
          {totpStatus.enabled && (
            <span className="text-xs px-2 py-0.5 bg-primary-light text-primary-dark">Enabled</span>
          )}
        </div>
        <p className="text-sm text-muted mb-4">
          Require a code from an authenticator app in addition to your password when signing in.
        </p>

        {totpStatus.enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">{totpStatus.unusedRecoveryCodes} unused recovery codes remaining.</p>
            <RegenerateRecoveryCodesButton />
            <div>
              <DisableTotpForm />
            </div>
          </div>
        ) : (
          <TotpEnrollFlow />
        )}
      </StandardSection>

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Passkeys</h2>
        <p className="text-sm text-muted mb-4">
          Sign in with Touch ID, Face ID, Windows Hello, or a security key — no password needed, and it counts as
          your second factor on its own.
        </p>
        <PasskeyManager passkeys={passkeys} />
      </StandardSection>
    </div>
  );
}
