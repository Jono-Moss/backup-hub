import { ActionForm } from "@/components/ui/common/ActionForm";
import { listUsers } from "./actions";
import { createUser } from "./actions";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteUserButton } from "@/components/ui/users/DeleteUserButton";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { LuUsers } from "react-icons/lu";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [users, me] = await Promise.all([listUsers(), getCurrentUser()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">Users</h1>
        <p className="text-sm text-muted">
          Admins manage users and system notifications. Backup tasks are private to their owner: admins can see how
          many tasks a user has, but not the tasks themselves unless the owner shares them. Deleting a user also
          deletes all of their tasks and backups.
        </p>
      </div>

      <AddableSection
        id="users"
        title="All users"
        icon={<LuUsers />}
        count={users.length}
        description="Everyone who can sign in to this server."
        canAdd
        addLabel="Add user"
        panelTitle="New user"
        tabs={[
          {
            key: "new",
            label: "Create new",
            content: (
              <ActionForm action={createUser} success="User created" resetOnSuccess className="space-y-4 max-w-xl">
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
              </ActionForm>
            ),
          },
        ]}
        emptyMessage="No users."
      >
        <StandardEntryList>
          {users.map((user) => {
            const isMe = user.id === me?.id;
            return (
              <StandardEntryCard
                key={user.id}
                title={
                  <>
                    {user.name} {isMe && <span className="font-normal text-muted">(you)</span>}
                  </>
                }
                meta={
                  <>
                    {user.email} · {user.taskCount} task{user.taskCount === 1 ? "" : "s"}
                  </>
                }
                badges={
                  <StandardBadge tone={user.role === "admin" ? "primary" : "neutral"}>
                    {user.role === "admin" ? "Admin" : "User"}
                  </StandardBadge>
                }
                actions={
                  !isMe && (
                    <>
                      <StandardLinkButton href={`/users/${user.id}`} title="Edit" compact />
                      <DeleteUserButton userId={user.id} />
                    </>
                  )
                }
              />
            );
          })}
        </StandardEntryList>
      </AddableSection>
    </div>
  );
}
