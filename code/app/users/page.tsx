import Link from "next/link";
import { listUsers } from "./actions";
import { createUser } from "./actions";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteUserButton } from "@/components/ui/DeleteUserButton";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [users, me] = await Promise.all([listUsers(), getCurrentUser()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Users</h1>
        <p className="text-sm text-muted">
          Admins have full access to everything, including user management. Regular users can manage tasks, API
          keys, and task notifications, but not other users.
        </p>
      </div>

      <StandardSection>
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">
                {user.name} {user.id === me?.id && <span className="text-muted font-normal">(you)</span>}
              </p>
              <p className="text-xs text-muted mt-0.5">{user.email}</p>
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`text-xs px-2 py-0.5 ${
                  user.role === "admin" ? "bg-primary-light text-primary-dark" : "bg-paper text-muted"
                }`}
              >
                {user.role}
              </span>
              {user.id != me?.id && <StandardLinkButton href={`/users/${user.id}`} title="Edit" /> }
              {user.id != me?.id && <DeleteUserButton userId={user.id} /> }
            </div>
          </div>
        ))}
      </StandardSection>

      <StandardSection WidthVariant="half">
        <h2 className="text-sm font-semibold text-ink mb-4">Add a user</h2>
        <form action={createUser} className="space-y-4">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" required className="w-full border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="password">
              Temporary password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="role">
              Role
            </label>
            <select id="role" name="role" className="w-full border border-line px-3 py-2 text-sm bg-white">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <StandardSubmitButton title="Create user" />
        </form>
      </StandardSection>
    </div>
  );
}
