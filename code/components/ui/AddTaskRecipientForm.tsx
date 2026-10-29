"use client";

import { addTaskRecipient } from "@/app/tasks/actions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";
import { NotificationChannelFields } from "./NotificationChannelFields";

export function AddTaskRecipientForm({ taskId, canSaveToAccount = false }: { taskId: string; canSaveToAccount?: boolean }) {
  const bound = addTaskRecipient.bind(null, taskId);

  return (
    <form
      action={bound}
      className="space-y-4 max-w-xl"
    >
      <p className="text-sm font-semibold text-ink">Add a new notification channel</p>
      <NotificationChannelFields idPrefix="task-recipient" showLabel />

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

      {canSaveToAccount && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="saveToAccount" value="true" className="mt-0.5" />
          <span>
            Save to my account so my other tasks can use it
            <span className="block text-xs text-muted">
              Leave unticked to keep it task-only: these settings can then only ever be used by this task.
            </span>
          </span>
        </label>
      )}

      <StandardSubmitButton
        title="Add"
        pendingTitle="...Processing"
      />
    </form>
  );
}
