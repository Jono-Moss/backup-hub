import { listSystemRecipients } from "./actions";
import { requireAdmin } from "@/lib/auth/session";
import { AddSystemRecipientForm } from "@/components/ui/notifications/AddSystemRecipientForm";
import { RemoveSystemRecipientButton } from "@/components/ui/notifications/RemoveSystemRecipientButton";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection } from "@/components/ui/common/AddableSection";
import { LuMegaphone } from "react-icons/lu";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  user_login: "User logins",
  user_created: "User created",
  user_deleted: "User deleted",
  task_created: "Backup task created",
  task_deleted: "Backup task deleted",
  security_reset: "2FA/passkeys reset",
};

export default async function SystemNotificationsPage() {
  await requireAdmin();
  const recipients = await listSystemRecipients();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink mb-1">System notifications</h1>
        <p className="text-sm text-muted">
          Server-wide alerts for account and task-lifecycle events (email, ntfy, Telegram or Discord), managed by
          admins. Backup success/failure alerts are separate: each user sets those up under{" "}
          <a href="/notification-channels" className="text-primary hover:underline">Notifications</a> and on each
          task&apos;s page.
        </p>
      </div>

      <AddableSection
        id="recipients"
        title="Recipients"
        icon={<LuMegaphone />}
        count={recipients.length}
        description="Who is alerted about account and task-lifecycle events, and for which ones."
        canAdd
        addLabel="Add recipient"
        panelTitle="New system recipient"
        tabs={[{ key: "new", label: "Create new", content: <AddSystemRecipientForm /> }]}
        emptyMessage="No system notification recipients yet."
      >
        <StandardEntryList>
          {recipients.map((r) => (
            <StandardEntryCard
              key={r.id}
              title={r.target}
              badges={r.events.map((e) => (
                <StandardBadge key={e}>{EVENT_LABELS[e] ?? e}</StandardBadge>
              ))}
              actions={<RemoveSystemRecipientButton id={r.id} />}
            />
          ))}
        </StandardEntryList>
      </AddableSection>
    </div>
  );
}
