"use client";

import { removeTaskRecipient } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function RemoveTaskRecipientButton({
  taskId,
  recipientId,
  taskOnly,
}: {
  taskId: string;
  recipientId: string;
  taskOnly: boolean;
}) {
  const bound = removeTaskRecipient.bind(null, taskId, recipientId);

  return (
    <StandardActionButton
      action={bound}
      title="Remove"
      variant="danger"
      compact
      pendingTitle="Removing..."
      confirmMessage={
        taskOnly
          ? "Remove this notification channel? It's task-only, so it and its saved settings are deleted."
          : "Stop this task using this notification channel? It stays saved in the owner's account for their other tasks."
      }
    />
  );
}