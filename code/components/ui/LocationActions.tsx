"use client";

import { useState } from "react";
import { deleteLocation, makeLocationReusable, testLocation } from "@/app/locations/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function TestLocationButton({ id }: { id: string }) {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      <StandardActionButton
        action={async () => setResult(await testLocation(id))}
        title="Test"
        variant="outline"
        pendingTitle="Testing…"
        compact
      />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? result.message ?? "OK" : `Failed: ${result.message ?? "unknown error"}`}
        </span>
      )}
    </div>
  );
}

export function DeleteLocationButton({ id, usedByCount }: { id: string; usedByCount: number }) {
  return (
    <StandardActionButton
      action={() => deleteLocation(id)}
      title="Delete"
      variant="danger"
      pendingTitle="Deleting…"
      confirmMessage={
        usedByCount > 0
          ? `Delete this save location and its saved credentials? ${usedByCount} task${usedByCount === 1 ? "" : "s"} will stop copying backups here. Files already uploaded to the provider are not deleted.`
          : "Delete this save location and its saved credentials? Files already uploaded to the provider are not deleted."
      }
      compact
    />
  );
}

export function MakeReusableButton({ id }: { id: string }) {
  return (
    <StandardActionButton
      action={() => makeLocationReusable(id)}
      title="Make reusable"
      variant="outline"
      pendingTitle="Saving…"
      confirmMessage="Save this location to your account so your other tasks can use it too? This can't be undone — once other tasks use it, it can't go back to task-only."
      compact
    />
  );
}
