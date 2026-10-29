"use client";

import { addTaskRecipient } from "@/app/tasks/actions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";
import { NotificationChannelFields } from "./NotificationChannelFields";

export function AddTaskRecipientForm({ taskId }: { taskId: string }) {
  const bound = addTaskRecipient.bind(null, taskId);

  return (
    <form
      action={bound}
      className="space-y-4 max-w-xl"
    >
      <NotificationChannelFields idPrefix="task-recipient" />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="notifyOnSuccess" />
          On success
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="notifyOnFailure"
            defaultChecked
          />
          On failure
        </label>
      </div>

      <StandardSubmitButton
        title="Add"
        pendingTitle="...Processing"
      />
    </form>
  );
}
