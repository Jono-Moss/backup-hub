import { notFound } from "next/navigation";
import { getUser, updateUser, getUserAuthFactors, adminResetAuthFactors } from "../actions";
import { getCurrentUser } from "@/lib/auth/session";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, me, authFactors] = await Promise.all([getUser(id), getCurrentUser(), getUserAuthFactors(id)]);
  if (!user) notFound();

  const isSelf = user.id === me?.id;
  const save = updateUser.bind(null, user.id);
  const resetAuthFactors = adminResetAuthFactors.bind(null, user.id);

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold text-ink mb-1">{user.name}</h1>
      <p className="text-sm text-muted mb-6">{user.email}</p>

      <StandardSection>
        <form action={save} className="space-y-5">
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
            
        </form>
      </StandardSection>

      {!isSelf && (authFactors.totpEnabled || authFactors.passkeyCount > 0) && (
        <div className="mt-6">
          <StandardSection>
            <h2 className="text-sm font-semibold text-ink mb-1">Two-factor authentication & passkeys</h2>
            <p className="text-sm text-muted mb-4">
              {authFactors.totpEnabled ? "Authenticator app enabled" : "No authenticator app"}
              {" · "}
              {authFactors.passkeyCount} passkey{authFactors.passkeyCount === 1 ? "" : "s"} registered
            </p>
            <StandardActionButton
              title="Reset 2FA & passkeys"
              variant="danger"
              confirmMessage={`Remove all two-factor authentication and passkeys for ${user.name}? They'll be able to sign in with just their password afterward, and will need to re-enroll from their own account page.`}
              action={resetAuthFactors}
            />
          </StandardSection>
        </div>
      )}
    </div>
  );
}
