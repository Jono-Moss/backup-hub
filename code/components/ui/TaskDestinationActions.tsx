"use client";

import { useState } from "react";
import {
  removeTaskDestination,
  toggleTaskDestinationEnabled,
  testExistingTaskDestination,
} from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function ToggleTaskDestinationButton({
  taskId,
  destinationId,
  enabled,
}: {
  taskId: string;
  destinationId: string;
  enabled: boolean;
}) {
  return (
    <StandardActionButton
      title={enabled ? "Disable" : "Enable"}
      action={() => toggleTaskDestinationEnabled(taskId, destinationId, !enabled)}
      variant="outline"
      compact
    />
  );
}

export function RemoveTaskDestinationButton({ taskId, destinationId }: { taskId: string; destinationId: string }) {
  const bound = removeTaskDestination.bind(null, taskId, destinationId);
  return (
    <StandardActionButton
      action={bound}
      title="Remove"
      variant="danger"
      pendingTitle="Removing..."
      confirmMessage="Remove this backup destination? Future runs will stop copying files here — this doesn't delete anything already uploaded to the provider."
      compact
    />
  );
}

export function TestTaskDestinationButton({ taskId, destinationId }: { taskId: string; destinationId: string }) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  async function handleClick() {
    setResult(await testExistingTaskDestination(taskId, destinationId));
  }

  return (
    <div className="flex items-center gap-2">
      <StandardActionButton action={handleClick} title="Test" variant="outline" pendingTitle="Testing…" compact />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? "OK" : `Failed: ${result.message ?? "unknown error"}`}
        </span>
      )}
    </div>
  );
}
