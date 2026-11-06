"use client";

import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { addTaskRecipient } from "@/app/tasks/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { NotificationChannelFields } from "@/components/ui/notifications/NotificationChannelFields";

export function AddTaskRecipientForm({ taskId, canSaveToAccount = false }: { taskId: string; canSaveToAccount?: boolean }) {
  const t = useTranslations("notifications");
  const bound = addTaskRecipient.bind(null, taskId);

  return (
    <ActionForm action={bound} success={t("notificationAdded")} resetOnSuccess className="space-y-4 max-w-xl">
      <NotificationChannelFields idPrefix="task-recipient" showLabel />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="notifyOnSuccess" />
          {t("onSuccess")}
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="notifyOnFailure"
            defaultChecked
          />
          {t("onFailure")}
        </label>
      </div>

      {canSaveToAccount && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="saveToAccount" value="true" className="mt-0.5" />
          <span>
            {t("saveToAccount")}
            <span className="block text-xs text-muted">
              {t("saveToAccountHint")}
            </span>
          </span>
        </label>
      )}

      <StandardSubmitButton
        title={t("add")}
        pendingTitle={t("adding")}
      />
    </ActionForm>
  );
}
