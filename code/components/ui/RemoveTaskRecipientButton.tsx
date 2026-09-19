"use client";

import { removeTaskRecipient } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function RemoveTaskRecipientButton({
  taskId,
  recipientId,
}: {
  taskId: string;
  recipientId: string;
}) {
  const bound = removeTaskRecipient.bind(null, taskId, recipientId);

  return (
    <StandardActionButton
      action={bound}
      title="Remove"
      variant="danger"
      pendingTitle="Removing..."
      confirmMessage="Delete this notification receipt? This cannot be undone."
    />
  );
}