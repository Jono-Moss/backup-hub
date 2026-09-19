"use client";

import { removeSystemRecipient } from "@/app/notifications/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function RemoveSystemRecipientButton({ id }: { id: string }) {
  return (
    <StandardActionButton
      action={() => removeSystemRecipient(id)}
      title="Remove"
      variant="danger"
    />
  );
}
