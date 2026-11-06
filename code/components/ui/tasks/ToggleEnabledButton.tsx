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
      shortTitle={enabled ? "Disable" : "Enable"}
      action={() => toggleTaskEnabled(taskId, !enabled)}
      successMessage={enabled ? "Schedule disabled" : "Schedule enabled"}
      variant="outline"
      fullWidth
    />
  );
}