import { ActionForm } from "@/components/ui/common/ActionForm";
import { requireUser } from "@/lib/auth/session";
import { updateOwnProfile } from "@/app/users/actions";
import { getTotpStatus, listPasskeys, listMyLoginAttempts } from "@/app/account/actions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { TotpEnrollFlow } from "@/components/ui/auth/TotpEnrollFlow";
import { DisableTotpForm } from "@/components/ui/auth/DisableTotpForm";
import { RegenerateRecoveryCodesButton } from "@/components/ui/auth/RegenerateRecoveryCodesButton";
import { PasskeyManager } from "@/components/ui/auth/PasskeyManager";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { LuFingerprint, LuLogIn, LuShieldCheck, LuUser } from "react-icons/lu";
import { LocalTime } from "@/components/ui/common/LocalTime";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { METHOD_LABEL, OUTCOME_LABEL, describeUserAgent } from "@/components/ui/auth/loginAttemptLabels";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  const [totpStatus, passkeys, attempts] = await Promise.all([getTotpStatus(), listPasskeys(), listMyLoginAttempts()]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Your account</h1>
        <p className="text-sm text-muted">{me.email}</p>
      </div>

      <StandardSection id="profile">
        <StandardSectionHeader
          title="Profile & password"
          icon={<LuUser />}
          description="Your display name, and your sign-in password."
        />
        <ActionForm action={updateOwnProfile} success="Profile saved" resetOnSuccess className="space-y-5 max-w-md">
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

          <p className="text-sm font-semibold text-ink">Change password</p>
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
        </ActionForm>
      </StandardSection>

      <StandardSection id="two-factor">
        <StandardSectionHeader
          title="Two-factor authentication"
          icon={<LuShieldCheck />}
          description="Require a code from an authenticator app in addition to your password when signing in."
          action={
            totpStatus.enabled ? (
              <StandardBadge tone="primary">Enabled</StandardBadge>
            ) : (
              <StandardBadge tone="warn">Not enabled</StandardBadge>
            )
          }
        />

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

      <StandardSection id="passkeys">
        <StandardSectionHeader
          title="Passkeys"
          icon={<LuFingerprint />}
          count={passkeys.length}
          description="Sign in with Touch ID, Face ID, Windows Hello, or a security key — no password needed, and it counts as your second factor on its own."
        />
        <PasskeyManager passkeys={passkeys} />
      </StandardSection>

      <StandardSection id="sign-ins">
        <StandardSectionHeader
          title="Recent sign-in activity"
          icon={<LuLogIn />}
          count={attempts.length}
          description="The latest attempts to sign in to your account, successful or not. Kept for 90 days. If you don't recognise one, change your password."
        />
        {attempts.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No sign-ins recorded yet.
          </div>
        ) : (
          <StandardEntryList>
            {attempts.map((a) => (
              <StandardEntryCard
                key={a.id}
                title={describeUserAgent(a.userAgent)}
                meta={
                  <>
                    <LocalTime value={a.createdAt} />
                    {a.ipAddress && <> · {a.ipAddress}</>}
                    {" · "}
                    {METHOD_LABEL[a.method]}
                  </>
                }
                badges={<StandardBadge tone={OUTCOME_LABEL[a.outcome].tone}>{OUTCOME_LABEL[a.outcome].text}</StandardBadge>}
              />
            ))}
          </StandardEntryList>
        )}
      </StandardSection>
    </div>
  );
}
