import { ActionForm } from "@/components/ui/common/ActionForm";
import { listUsers } from "./actions";
import { getTranslations } from "next-intl/server";
import { createUser } from "./actions";
import { getCurrentUser, requireAdmin } from "@/lib/auth/session";
import { DeleteUserButton } from "@/components/ui/users/DeleteUserButton";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { LuUsers } from "react-icons/lu";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireAdmin();
  const [users, me] = await Promise.all([listUsers(), getCurrentUser()]);

  const t = await getTranslations("users");
  const tCommon = await getTranslations("common");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("title")}</h1>
        <p className="text-sm text-muted">
          {t("intro")}
        </p>
      </div>

      <AddableSection
        id="users"
        title={t("allUsers")}
        icon={<LuUsers />}
        count={users.length}
        description={t("allUsersDescription")}
        canAdd
        addLabel={t("addUser")}
        panelTitle={t("newUser")}
        tabs={[
          {
            key: "new",
            label: t("createNew"),
            content: (
              <ActionForm action={createUser} success={t("userCreated")} resetOnSuccess className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm text-ink mb-1" htmlFor="name">
                    {t("name")}
                  </label>
                  <input id="name" name="name" required className="w-full border border-line px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-ink mb-1" htmlFor="email">
                    {t("email")}
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
                    {t("tempPassword")}
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
                    {t("role")}
                  </label>
                  <select id="role" name="role" className="w-full border border-line px-3 py-2 text-sm bg-white">
                    <option value="user">{t("roleUser")}</option>
                    <option value="admin">{t("roleAdmin")}</option>
                  </select>
                </div>
                <StandardSubmitButton title={t("createUser")} />
              </ActionForm>
            ),
          },
        ]}
        emptyMessage={t("noUsers")}
      >
        <StandardEntryList>
          {users.map((user) => {
            const isMe = user.id === me?.id;
            return (
              <StandardEntryCard
                key={user.id}
                title={
                  <>
                    {user.name} {isMe && <span className="font-normal text-muted">{t("you")}</span>}
                  </>
                }
                meta={
                  <>
                    {user.email} · {t("taskCount", { count: user.taskCount })}
                  </>
                }
                badges={
                  <StandardBadge tone={user.role === "admin" ? "primary" : "neutral"}>
                    {user.role === "admin" ? t("roleAdmin") : t("roleUser")}
                  </StandardBadge>
                }
                actions={
                  !isMe && (
                    <>
                      <StandardLinkButton href={`/users/${user.id}`} title={t("edit")} compact />
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
