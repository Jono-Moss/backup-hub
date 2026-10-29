"use client";

import { addAccountChannel } from "@/app/notification-channels/actions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";
import { NotificationChannelFields } from "./NotificationChannelFields";

export function AddAccountChannelForm() {
  return (
    <form action={addAccountChannel} className="space-y-4 max-w-xl">
      <p className="text-sm font-semibold text-ink">Add a notification channel</p>
      <NotificationChannelFields idPrefix="account-channel" showLabel />
      <StandardSubmitButton title="Add channel" />
    </form>
  );
}
