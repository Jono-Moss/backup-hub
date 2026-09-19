"use client";

import { deleteTask } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  return (
    <StandardActionButton
      action={() => deleteTask(taskId)}
      title="Delete task"
      variant="danger"
      pendingTitle="Removing..."
      confirmMessage="Delete this task? Its schedule will stop immediately. Backup history and files are kept."
    />
  );
}
