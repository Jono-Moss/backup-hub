"use client";

import { useState } from "react";
import {
  removeTaskDestination,
  toggleTaskDestinationEnabled,
  testExistingTaskDestination,
} from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

// All of these act on a task's *link* to a save location (linkId), not on
// the saved location itself — see task_destination in db/schema.ts.

export function ToggleTaskDestinationButton({
  taskId,
  linkId,
  enabled,
}: {
  taskId: string;
  linkId: string;
  enabled: boolean;
}) {
  return (
    <StandardActionButton
      title={enabled ? "Disable" : "Enable"}
      action={() => toggleTaskDestinationEnabled(taskId, linkId, !enabled)}
      variant="outline"
      compact
    />
  );
}

export function RemoveTaskDestinationButton({
  taskId,
  linkId,
  taskOnly,
}: {
  taskId: string;
  linkId: string;
  taskOnly: boolean;
}) {
  const bound = removeTaskDestination.bind(null, taskId, linkId);
  return (
    <StandardActionButton
      action={bound}
      title="Remove"
      variant="danger"
      pendingTitle="Removing..."
      confirmMessage={
        taskOnly
          ? "Remove this save location? It's task-only, so it and its saved credentials are deleted. Future runs will stop copying files here — this doesn't delete anything already uploaded to the provider."
          : "Stop this task using this save location? It stays saved in the owner's account for their other tasks. This doesn't delete anything already uploaded to the provider."
      }
      compact
    />
  );
}

export function TestTaskDestinationButton({ taskId, linkId }: { taskId: string; linkId: string }) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  async function handleClick() {
    setResult(await testExistingTaskDestination(taskId, linkId));
  }

  return (
    <div className="flex items-center gap-2">
      <StandardActionButton action={handleClick} title="Test" variant="outline" pendingTitle="Testing…" compact />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? result.message ?? "OK" : `Failed: ${result.message ?? "unknown error"}`}
        </span>
      )}
    </div>
  );
}
