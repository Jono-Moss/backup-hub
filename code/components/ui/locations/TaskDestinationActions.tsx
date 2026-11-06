"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  removeTaskDestination,
  toggleTaskDestinationEnabled,
  testExistingTaskDestination,
} from "@/app/tasks/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

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
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      title={enabled ? t("disable") : t("enable")}
      action={() => toggleTaskDestinationEnabled(taskId, linkId, !enabled)}
      successMessage={enabled ? t("disabledForTask") : t("enabledForTask")}
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
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const bound = removeTaskDestination.bind(null, taskId, linkId);
  return (
    <StandardActionButton
      action={bound}
      successMessage={t("removedFromTask")}
      title={tCommon("remove")}
      variant="danger"
      pendingTitle={t("removing")}
      confirmMessage={
        taskOnly
          ? t("removeTaskOnlyConfirm")
          : t("removeSavedConfirm")
      }
      compact
    />
  );
}

export function TestTaskDestinationButton({ taskId, linkId }: { taskId: string; linkId: string }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  async function handleClick() {
    setResult(await testExistingTaskDestination(taskId, linkId));
  }

  return (
    <div className="flex items-center gap-2">
      <StandardActionButton action={handleClick} title={t("test")} variant="outline" pendingTitle={t("testing")} compact />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? result.message ?? t("ok") : t("failedWhy", { reason: result.message ?? t("unknownError") })}
        </span>
      )}
    </div>
  );
}
