"use client";

import { addTaskRecipient } from "@/app/tasks/actions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";

export function AddTaskRecipientForm({ taskId }: { taskId: string }) {
  const bound = addTaskRecipient.bind(null, taskId);

  return (
    <form
      action={bound}
      className="flex flex-wrap items-end gap-4"
    >
      <div className="flex-1 min-w-[200px]">
        <label
          className="block text-sm text-ink mb-1"
          htmlFor="email"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink pb-2">
        <input type="checkbox" name="notifyOnSuccess" />
        On success
      </label>

      <label className="flex items-center gap-2 text-sm text-ink pb-2">
        <input
          type="checkbox"
          name="notifyOnFailure"
          defaultChecked
        />
        On failure
      </label>

      <StandardSubmitButton
        title="Add"
        pendingTitle="...Processing"
      />
    </form>
  );
}