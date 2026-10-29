import { listSystemRecipients } from "./actions";
import { AddSystemRecipientForm } from "@/components/ui/AddSystemRecipientForm";
import { RemoveSystemRecipientButton } from "@/components/ui/RemoveSystemRecipientButton";
import { StandardSection } from "@/components/ui/standard/StandardSection";

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

      <StandardSection>
        {recipients.length === 0 ? (
          <p className="text-sm text-muted p-6">No system notification recipients yet.</p>
        ) : (
          recipients.map((r) => (
            <div key={r.id} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between py-4 sm:px-5">
              <div>
                <p className="text-sm font-medium text-ink">{r.target}</p>
                <p className="text-xs text-muted mt-0.5">{r.events.map((e) => EVENT_LABELS[e]).join(", ")}</p>
              </div>
              <RemoveSystemRecipientButton id={r.id} />
            </div>
          ))
        )}
      </StandardSection>

      <StandardSection WidthVariant="half">
        <AddSystemRecipientForm />
      </StandardSection>
    </div>
  );
}
