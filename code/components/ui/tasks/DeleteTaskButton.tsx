"use client";

import { useTranslations } from "next-intl";
import { deleteTask } from "@/app/tasks/actions";
import { DeleteWithFilesButton } from "@/components/ui/common/DeleteWithFilesButton";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const t = useTranslations("task");
  const tCommon = useTranslations("common");
  return (
    <DeleteWithFilesButton
      buttonTitle={t("deleteTask")}
      heading={t("deleteTaskHeading")}
      description={t("deleteTaskDescription")}
      keepNote={t("deleteTaskKeepNote", { id: taskId })}
      confirmLabel={t("deleteTask")}
      successMessage={t("taskDeleted")}
      onDelete={(deleteFiles) => deleteTask(taskId, deleteFiles)}
    />
  );
}
