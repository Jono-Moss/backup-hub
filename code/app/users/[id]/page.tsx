import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { notFound } from "next/navigation";
import { getUser, updateUser, getUserAuthFactors, adminResetAuthFactors, getUserLockout, unlockUser } from "../actions";
import { getCurrentUser, requireAdmin } from "@/lib/auth/session";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { LuArrowLeft, LuLock, LuShieldCheck, LuUser } from "react-icons/lu";
import { LocalTime } from "@/components/ui/common/LocalTime";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [user, me, authFactors, lockout] = await Promise.all([
    getUser(id),
    getCurrentUser(),
    getUserAuthFactors(id),
    getUserLockout(id),
  ]);
  if (!user) notFound();

  const isSelf = user.id === me?.id;
  const save = updateUser.bind(null, user.id);
  const resetAuthFactors = adminResetAuthFactors.bind(null, user.id);
  const unlock = unlockUser.bind(null, user.id);

  const t = await getTranslations("users");
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <a href="/users" className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary mb-3">
          <LuArrowLeft size={14} aria-hidden="true" /> {t("allUsers")}
        </a>
        <h1 className="text-xl font-semibold text-ink mb-1">{user.name}</h1>
        <p className="text-sm text-muted">
          {user.email} · {t("ownsTasks", { count: user.taskCount })}
        </p>
      </div>

      {lockout.locked && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-danger bg-danger-light px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-ink">
            <LuLock size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
            <span>
              {t.rich("locked", {
                strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                time: () => <LocalTime value={lockout.until} />,
              })}
            </span>
          </p>
          <StandardActionButton title={t("unlock")} variant="outline" compact action={unlock} successMessage={t("unlocked")} />
        </div>
      )}

      <StandardSection id="details">
        <StandardSectionHeader
          title={t("detailsTitle")}
          icon={<LuUser />}
          description={t("detailsDescription")}
          action={
            <StandardBadge tone={user.role === "admin" ? "primary" : "neutral"}>
              {user.role === "admin" ? "Admin" : "User"}
            </StandardBadge>
          }
        />
        <ActionForm action={save} success={t("changesSaved")} resetOnSuccess className="space-y-5 max-w-md">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              {t("name")}
            </label>
            <input
              id="name"
              name="name"
              defaultValue={user.name}
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="role">
              {t("role")}
            </label>
            {isSelf ? (
              <>
                <input type="hidden" name="role" value={user.role} />
                <input
                  disabled
                  value={user.role === "admin" ? t("roleAdmin") : t("roleUser")}
                  className="w-full border border-line px-3 py-2 text-sm bg-paper text-muted"
                />
                <p className="text-xs text-muted mt-1">{t("ownRole")}</p>
              </>
            ) : (
              <select
                id="role"
                name="role"
                defaultValue={user.role}
                className="w-full border border-line px-3 py-2 text-sm bg-white"
              >
                <option value="user">{t("roleUser")}</option>
                <option value="admin">{t("roleAdmin")}</option>
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="password">
              {t("resetPassword")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder={t("keepPassword")}
              minLength={8}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <StandardSubmitButton title={t("saveChanges")} />
        </ActionForm>
      </StandardSection>

      {!isSelf && (
        <StandardSection id="security">
          <StandardSectionHeader
            title={t("securityTitle")}
            icon={<LuShieldCheck />}
            description={t("securityDescription")}
          />
          {authFactors.totpEnabled || authFactors.passkeyCount > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <StandardBadge tone={authFactors.totpEnabled ? "primary" : "neutral"}>
                  {authFactors.totpEnabled ? t("authenticatorOn") : t("authenticatorOff")}
                </StandardBadge>
                <StandardBadge tone={authFactors.passkeyCount > 0 ? "primary" : "neutral"}>
                  {t("passkeyCount", { count: authFactors.passkeyCount })}
                </StandardBadge>
              </div>
              <StandardActionButton
                title={t("resetFactors")}
                variant="danger"
                confirmMessage={t("resetFactorsConfirm", { name: user.name })}
                action={resetAuthFactors}
                successMessage={t("factorsReset")}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              {t("noFactors")}
            </div>
          )}
        </StandardSection>
      )}
    </div>
  );
}
