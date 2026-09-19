"use client";

import { useState } from "react";
import { dryRunBackup } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function DryRunButton() {
  const [result, setResult] = useState<{ ok: boolean; message?: string; sizeBytes?: number } | null>(null);

  async function handleClick() {
    const form = document.getElementById("task-form") as HTMLFormElement;
    const data = new FormData(form);

    const res = await dryRunBackup(data);
    setResult(res);
  }

  return (
    <div className="flex items-center gap-3">
      <StandardActionButton
        action={handleClick}
        variant="outline"
        title="Dry run"
        pendingTitle="Running backup…"
      />
      {result && (
        <span className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok
            ? `Backup succeeded (${formatBytes(result.sizeBytes ?? 0)}, discarded)`
            : `Failed: ${result.message ?? "unknown error"}`}
        </span>
      )}
    </div>
  );
}