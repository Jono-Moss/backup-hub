"use client";

import { toggleTaskEnabled } from "@/app/tasks/actions";

import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function ToggleEnabledButton({
  taskId,
  enabled,
}: {
  taskId: string;
  enabled: boolean;
}) {
  return (
    <StandardActionButton
      title={enabled ? "Disable schedule" : "Enable schedule"}
      action={() => toggleTaskEnabled(taskId, !enabled)}
      variant="outline"
    />
  );
}