import { ActionForm } from "@/components/ui/common/ActionForm";
import { requireUser } from "@/lib/auth/session";
import { updateOwnProfile } from "@/app/users/actions";
import { getTotpStatus, listPasskeys, listMyLoginAttempts, listMySessions, endSession, endAllOtherSessions } from "@/app/account/actions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { TotpEnrollFlow } from "@/components/ui/auth/TotpEnrollFlow";
import { DisableTotpForm } from "@/components/ui/auth/DisableTotpForm";
import { RegenerateRecoveryCodesButton } from "@/components/ui/auth/RegenerateRecoveryCodesButton";
import { PasskeyManager } from "@/components/ui/auth/PasskeyManager";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { LuFingerprint, LuLaptop, LuLogIn, LuShieldCheck, LuUser } from "react-icons/lu";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { LocalTime } from "@/components/ui/common/LocalTime";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { getLoginLabels } from "@/components/ui/auth/loginAttemptLabels";
import { getTranslations } from "next-intl/server";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  const [totpStatus, passkeys, attempts, sessions] = await Promise.all([
    getTotpStatus(),
    listPasskeys(),
    listMyLoginAttempts(),
    listMySessions(),
  ]);
  const otherSessions = sessions.filter((s) => !s.current).length;
  const t = await getTranslations("account");
  const { outcome, method, describeUserAgent } = await getLoginLabels();
  const time = (value: Date) => () => <LocalTime value={value} />;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("title")}</h1>
        <p className="text-sm text-muted">{me.email}</p>
      </div>

      <StandardSection id="profile">
        <StandardSectionHeader
          title={t("profileTitle")}
          icon={<LuUser />}
          description={t("profileDescription")}
        />
        <ActionForm action={updateOwnProfile} resetOnSuccess className="space-y-5 max-w-md">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              {t("name")}
            </label>
            <input
              id="name"
              name="name"
              defaultValue={me.name}
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="locale">
              {t("language")}
            </label>
            <select
              id="locale"
              name="locale"
              defaultValue={me.locale ?? ""}
              className="w-full border border-line px-3 py-2 text-sm bg-white"
            >
              <option value="">{t("languageAuto")}</option>
              {LOCALES.map((l) => (
                <option key={l} value={l} lang={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">{t("languageHint")}</p>
          </div>

          <hr className="border-line" />

          <p className="text-sm font-semibold text-ink">{t("changePassword")}</p>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="currentPassword">
              {t("currentPassword")}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              placeholder={t("currentPasswordPlaceholder")}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="newPassword">
              {t("newPassword")}
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              placeholder={t("newPasswordPlaceholder")}
              minLength={8}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <StandardSubmitButton title={t("saveChanges")} />
        </ActionForm>
      </StandardSection>

      <StandardSection id="two-factor">
        <StandardSectionHeader
          title={t("twoFactorTitle")}
          icon={<LuShieldCheck />}
          description={t("twoFactorDescription")}
          action={
            totpStatus.enabled ? (
              <StandardBadge tone="primary">{t("enabled")}</StandardBadge>
            ) : (
              <StandardBadge tone="warn">{t("notEnabled")}</StandardBadge>
            )
          }
        />

        {totpStatus.enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">{t("recoveryRemaining", { count: totpStatus.unusedRecoveryCodes })}</p>
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
          title={t("passkeysTitle")}
          icon={<LuFingerprint />}
          count={passkeys.length}
          description={t("passkeysDescription")}
        />
        <PasskeyManager passkeys={passkeys} />
      </StandardSection>

      <StandardSection id="sessions">
        <StandardSectionHeader
          title={t("sessionsTitle")}
          icon={<LuLaptop />}
          count={sessions.length}
          description={t("sessionsDescription")}
          action={
            // Always shown so people know it exists; disabled when there's
            // nothing to sign out.
            <StandardActionButton
              title={t("signOutOthers")}
              variant="outline"
              compact
              disabled={otherSessions === 0}
              tooltip={otherSessions === 0 ? t("onlyThisDevice") : undefined}
              confirmMessage={t("signOutOthersConfirm", { count: otherSessions })}
              action={endAllOtherSessions}
            />
          }
        />
        <StandardEntryList>
          {sessions.map((s) => {
            const ipChanged = Boolean(s.createdIp && s.lastSeenIp && s.createdIp !== s.lastSeenIp);
            return (
              <StandardEntryCard
                key={s.id}
                title={describeUserAgent(s.userAgent)}
                meta={
                  <>
                    {s.createdIp
                      ? t.rich("sessionSignedInFrom", { time: time(s.createdAt), ip: s.createdIp })
                      : t.rich("sessionSignedIn", { time: time(s.createdAt) })}
                    {s.lastSeenAt && (
                      <>
                        {" · "}
                        {ipChanged
                          ? t.rich("sessionLastActiveFrom", { time: time(s.lastSeenAt), ip: s.lastSeenIp ?? "" })
                          : t.rich("sessionLastActive", { time: time(s.lastSeenAt) })}
                      </>
                    )}
                  </>
                }
                badges={
                  (s.current || ipChanged) && (
                    <>
                      {s.current && <StandardBadge tone="primary">{t("thisDevice")}</StandardBadge>}
                      {ipChanged && <StandardBadge tone="warn">{t("ipChanged")}</StandardBadge>}
                    </>
                  )
                }
                actions={
                  !s.current && (
                    <StandardActionButton
                      title={t("signOut")}
                      variant="danger"
                      compact
                      action={endSession.bind(null, s.id)}
                      successMessage={t("sessionSignedOut")}
                    />
                  )
                }
              />
            );
          })}
        </StandardEntryList>
      </StandardSection>

      <StandardSection id="sign-ins">
        <StandardSectionHeader
          title={t("historyTitle")}
          icon={<LuLogIn />}
          count={attempts.length}
          description={t("historyDescription")}
        />
        {attempts.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {t("noSignIns")}
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
                    {method(a.method)}
                  </>
                }
                badges={<StandardBadge tone={outcome(a.outcome).tone}>{outcome(a.outcome).text}</StandardBadge>}
              />
            ))}
          </StandardEntryList>
        )}
      </StandardSection>
    </div>
  );
}
