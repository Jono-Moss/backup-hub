"use client";

import { runNow } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function RunNowButton({ taskId }: { taskId: string }) {
  return (
    <StandardActionButton
      title="Run backup now"
      pendingTitle="Running…"
      action={() => runNow(taskId)}
    />
  );
}