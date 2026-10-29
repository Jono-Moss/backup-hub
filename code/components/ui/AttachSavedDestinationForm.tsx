"use client";

import { useState } from "react";
import { attachSavedDestination } from "@/app/tasks/actions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";

type SavedDestination = {
  id: string;
  label: string;
  type: string;
  supportsSubfolder: boolean;
};

// "Use a saved location" on a task page — owner only. Lists the owner's
// account-level save locations this task doesn't use yet.
export function AttachSavedDestinationForm({
  taskId,
  taskName,
  saved,
  providerLabels,
}: {
  taskId: string;
  taskName: string;
  saved: SavedDestination[];
  providerLabels: Record<string, string>;
}) {
  const [selectedId, setSelectedId] = useState(saved[0]?.id ?? "");
  const selected = saved.find((d) => d.id === selectedId);
  const bound = attachSavedDestination.bind(null, taskId);

  if (saved.length === 0) {
    return (
      <p className="text-sm text-muted">
        No other saved locations in your account. Tick &ldquo;Save to my account&rdquo; when adding one below, or add
        them on the{" "}
        <a href="/locations" className="text-primary underline">
          Save locations
        </a>{" "}
        page, to reuse them across tasks.
      </p>
    );
  }

  return (
    <form action={bound} className="space-y-4">
      <p className="text-sm font-semibold text-ink">Use a saved location</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="attach-destination">
            Saved location
          </label>
          <select
            id="attach-destination"
            name="destinationId"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {saved.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} — {providerLabels[d.type] ?? d.type}
              </option>
            ))}
          </select>
        </div>
        {selected?.supportsSubfolder && (
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="attach-subfolder">
              Subfolder for this task (optional)
            </label>
            <input
              key={selected.id}
              id="attach-subfolder"
              name="subfolder"
              defaultValue={taskName}
              className="w-full border border-line px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted mt-1">
              Added under the location&apos;s own folder, so tasks sharing it don&apos;t mix their files. Clear it to
              use the folder as-is.
            </p>
          </div>
        )}
      </div>
      <StandardSubmitButton title="Use this location" />
    </form>
  );
}
