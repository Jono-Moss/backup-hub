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

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <a href="/users" className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary mb-3">
          <LuArrowLeft size={14} aria-hidden="true" /> All users
        </a>
        <h1 className="text-xl font-semibold text-ink mb-1">{user.name}</h1>
        <p className="text-sm text-muted">
          {user.email} · owns {user.taskCount} task{user.taskCount === 1 ? "" : "s"}
        </p>
      </div>

      {lockout.locked && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-danger bg-danger-light px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-ink">
            <LuLock size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
            <span>
              <span className="font-semibold">Sign-in locked</span> after repeated failed attempts, until{" "}
              <LocalTime value={lockout.until} />. Passkeys still work.
            </span>
          </p>
          <StandardActionButton title="Unlock now" variant="outline" compact action={unlock} successMessage="Account unlocked" />
        </div>
      )}

      <StandardSection id="details">
        <StandardSectionHeader
          title="Account details"
          icon={<LuUser />}
          description="Name, role, and a password reset if they're locked out."
          action={
            <StandardBadge tone={user.role === "admin" ? "primary" : "neutral"}>
              {user.role === "admin" ? "Admin" : "User"}
            </StandardBadge>
          }
        />
        <ActionForm action={save} success="Changes saved" resetOnSuccess className="space-y-5 max-w-md">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              Name
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
              Role
            </label>
            {isSelf ? (
              <>
                <input type="hidden" name="role" value={user.role} />
                <input
                  disabled
                  value={user.role}
                  className="w-full border border-line px-3 py-2 text-sm bg-paper text-muted"
                />
                <p className="text-xs text-muted mt-1">You can't change your own role.</p>
              </>
            ) : (
              <select
                id="role"
                name="role"
                defaultValue={user.role}
                className="w-full border border-line px-3 py-2 text-sm bg-white"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="password">
              Reset password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Leave blank to keep current password"
              minLength={8}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <StandardSubmitButton title="Save changes" />
        </ActionForm>
      </StandardSection>

      {!isSelf && (
        <StandardSection id="security">
          <StandardSectionHeader
            title="Two-factor authentication & passkeys"
            icon={<LuShieldCheck />}
            description="Reset these if the user has lost their authenticator app or security key."
          />
          {authFactors.totpEnabled || authFactors.passkeyCount > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <StandardBadge tone={authFactors.totpEnabled ? "primary" : "neutral"}>
                  {authFactors.totpEnabled ? "Authenticator app enabled" : "No authenticator app"}
                </StandardBadge>
                <StandardBadge tone={authFactors.passkeyCount > 0 ? "primary" : "neutral"}>
                  {authFactors.passkeyCount} passkey{authFactors.passkeyCount === 1 ? "" : "s"}
                </StandardBadge>
              </div>
              <StandardActionButton
                title="Reset 2FA & passkeys"
                variant="danger"
                confirmMessage={`Remove all two-factor authentication and passkeys for ${user.name}? They'll be able to sign in with just their password afterward, and will need to re-enroll from their own account page.`}
                action={resetAuthFactors}
                successMessage="2FA and passkeys reset"
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              No authenticator app or passkeys set up — this user signs in with a password only.
            </div>
          )}
        </StandardSection>
      )}
    </div>
  );
}
