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
          Account and task-lifecycle emails, separate from per-task backup success/failure alerts (set those on
          each task's page).
        </p>
      </div>

      <StandardSection>
        {recipients.length === 0 ? (
          <p className="text-sm text-muted p-6">No system notification recipients yet.</p>
        ) : (
          recipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink">{r.email}</p>
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
