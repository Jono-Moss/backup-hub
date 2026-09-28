"use client";

import { deleteTask } from "@/app/tasks/actions";
import { DeleteWithFilesButton } from "./DeleteWithFilesButton";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  return (
    <DeleteWithFilesButton
      buttonTitle="Delete task"
      heading="Delete this task?"
      description="Its schedule stops immediately, and the task, its run history, notification recipients and sharing are removed from the app."
      keepNote={`The backup files stay on the server in a folder named ${taskId} inside the backup directory, so you can still recover them by hand. They will no longer appear in the app.`}
      confirmLabel="Delete task"
      onDelete={(deleteFiles) => deleteTask(taskId, deleteFiles)}
    />
  );
}
