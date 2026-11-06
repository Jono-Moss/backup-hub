import { listSystemRecipients } from "./actions";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/session";
import { AddSystemRecipientForm } from "@/components/ui/notifications/AddSystemRecipientForm";
import { RemoveSystemRecipientButton } from "@/components/ui/notifications/RemoveSystemRecipientButton";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { LuMegaphone } from "react-icons/lu";

export const dynamic = "force-dynamic";


export default async function SystemNotificationsPage() {
  await requireAdmin();
  const recipients = await listSystemRecipients();

  const t = await getTranslations("systemPage");
  const tEvents = await getTranslations("systemEvents");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">{t("title")}</h1>
        <p className="text-sm text-muted">
          {t.rich("intro", {
            link: (chunks) => (
              <a href="/notification-channels" className="text-primary hover:underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>

      <AddableSection
        id="recipients"
        title={t("recipientsTitle")}
        icon={<LuMegaphone />}
        count={recipients.length}
        description={t("recipientsDescription")}
        canAdd
        addLabel={t("addRecipient")}
        panelTitle={t("newRecipient")}
        tabs={[{ key: "new", label: t("createNew"), content: <AddSystemRecipientForm /> }]}
        emptyMessage={t("noRecipients")}
      >
        <StandardEntryList>
          {recipients.map((r) => (
            <StandardEntryCard
              key={r.id}
              title={r.target}
              badges={r.events.map((e) => (
                <StandardBadge key={e}>{tEvents(e)}</StandardBadge>
              ))}
              actions={<RemoveSystemRecipientButton id={r.id} />}
            />
          ))}
        </StandardEntryList>
      </AddableSection>
    </div>
  );
}
