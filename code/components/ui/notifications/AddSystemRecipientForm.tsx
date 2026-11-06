"use client";

import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { addSystemRecipient } from "@/app/notifications/actions";
import { SYSTEM_NOTIFICATION_EVENTS } from "@/db/schema";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { NotificationChannelFields } from "@/components/ui/notifications/NotificationChannelFields";


export function AddSystemRecipientForm() {
  const t = useTranslations("notifications");
  const tEvents = useTranslations("systemEvents");

  return (
    <ActionForm action={addSystemRecipient} success={t("recipientAdded")} resetOnSuccess className="space-y-4">
      <NotificationChannelFields idPrefix="system-recipient" />
      <div>
        <p className="text-sm text-ink mb-2">{t("notifyFor")}</p>
        <div className="space-y-2">
          {SYSTEM_NOTIFICATION_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2">
              <input type="checkbox" name="events" value={event} />
              <span className="text-sm text-ink">{tEvents(event)}</span>
            </label>
          ))}
        </div>
      </div>
      <StandardSubmitButton title={t("addRecipient")} />
    </ActionForm>
  );
}
