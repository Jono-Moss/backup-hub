"use client";

import { ActionForm } from "@/components/ui/common/ActionForm";
import { addAccountChannel } from "@/app/notification-channels/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { NotificationChannelFields } from "@/components/ui/notifications/NotificationChannelFields";

export function AddAccountChannelForm() {
  return (
    <ActionForm action={addAccountChannel} success="Channel saved" resetOnSuccess className="space-y-4 max-w-xl">
      <NotificationChannelFields idPrefix="account-channel" showLabel />
      <StandardSubmitButton title="Add channel" />
    </ActionForm>
  );
}
