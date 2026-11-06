"use client";

import { removeSystemRecipient } from "@/app/notifications/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RemoveSystemRecipientButton({ id }: { id: string }) {
  return (
    <StandardActionButton
      action={() => removeSystemRecipient(id)}
      successMessage="Recipient removed"
      title="Remove"
      variant="danger"
      compact
    />
  );
}
