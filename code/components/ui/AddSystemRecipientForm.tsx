"use client";

import { addSystemRecipient } from "@/app/notifications/actions";
import { SYSTEM_NOTIFICATION_EVENTS, type SystemNotificationEvent } from "@/db/schema";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";

const EVENT_LABELS: Record<SystemNotificationEvent, string> = {
  user_login: "User logins",
  user_created: "User created",
  user_deleted: "User deleted",
  task_created: "Backup task created",
  task_deleted: "Backup task deleted",
  security_reset: "2FA/passkeys reset",
};

export function AddSystemRecipientForm() {

  return (
    <form
      action={(formData) => addSystemRecipient(formData)}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="w-full border border-line px-3 py-2 text-sm" />
      </div>
      <div>
        <p className="text-sm text-ink mb-2">Notify for</p>
        <div className="space-y-2">
          {SYSTEM_NOTIFICATION_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2">
              <input type="checkbox" name="events" value={event} />
              <span className="text-sm text-ink">{EVENT_LABELS[event]}</span>
            </label>
          ))}
        </div>
      </div>
      <StandardSubmitButton title="Add recipient" />
    </form>
  );
}
