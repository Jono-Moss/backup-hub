"use client";

import { useTranslations } from "next-intl";
import { runNow } from "@/app/tasks/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RunNowButton({ taskId }: { taskId: string }) {
  const t = useTranslations("task");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      title={t("runNow")}
      shortTitle={t("runNowShort")}
      pendingTitle={t("running")}
      action={() => runNow(taskId)}
      successMessage={t("backupCompleted")}
      fullWidth
    />
  );
}