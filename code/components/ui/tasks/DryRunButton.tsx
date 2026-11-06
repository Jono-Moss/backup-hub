"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { dryRunBackup } from "@/app/tasks/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function DryRunButton() {
  const t = useTranslations("newTask");
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
        title={t("dryRun")}
        pendingTitle={t("dryRunning")}
      />
      {result && (
        <span className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok
            ? t("dryRunOk", { size: formatBytes(result.sizeBytes ?? 0) })
            : t("failedWhy", { reason: result.message ?? t("unknownError") })}
        </span>
      )}
    </div>
  );
}