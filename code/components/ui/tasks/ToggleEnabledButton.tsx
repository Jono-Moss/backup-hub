"use client";

import { useTranslations } from "next-intl";
import { toggleTaskEnabled } from "@/app/tasks/actions";

import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function ToggleEnabledButton({
  taskId,
  enabled,
}: {
  taskId: string;
  enabled: boolean;
}) {
  const t = useTranslations("task");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      title={enabled ? t("disableSchedule") : t("enableSchedule")}
      shortTitle={enabled ? t("disableShort") : t("enableShort")}
      action={() => toggleTaskEnabled(taskId, !enabled)}
      successMessage={enabled ? t("scheduleDisabledToast") : t("scheduleEnabledToast")}
      variant="outline"
      fullWidth
    />
  );
}