"use client";

import { useTranslations } from "next-intl";
import { removeTaskRecipient } from "@/app/tasks/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RemoveTaskRecipientButton({
  taskId,
  recipientId,
  taskOnly,
}: {
  taskId: string;
  recipientId: string;
  taskOnly: boolean;
}) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const bound = removeTaskRecipient.bind(null, taskId, recipientId);

  return (
    <StandardActionButton
      action={bound}
      successMessage={t("notificationRemoved")}
      title={tCommon("remove")}
      variant="danger"
      compact
      pendingTitle={t("removing")}
      confirmMessage={
        taskOnly
          ? t("removeTaskOnlyConfirm")
          : t("removeSavedConfirm")
      }
    />
  );
}