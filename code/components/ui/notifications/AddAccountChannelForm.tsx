"use client";

import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { addAccountChannel } from "@/app/notification-channels/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { NotificationChannelFields } from "@/components/ui/notifications/NotificationChannelFields";

export function AddAccountChannelForm() {
  const t = useTranslations("notifications");
  return (
    <ActionForm action={addAccountChannel} success={t("channelSaved")} resetOnSuccess className="space-y-4 max-w-xl">
      <NotificationChannelFields idPrefix="account-channel" showLabel />
      <StandardSubmitButton title={t("addChannel")} />
    </ActionForm>
  );
}
