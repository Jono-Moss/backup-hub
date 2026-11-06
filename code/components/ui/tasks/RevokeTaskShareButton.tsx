"use client";

import { useTranslations } from "next-intl";
import { revokeTaskShare } from "@/app/tasks/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RevokeTaskShareButton({ taskId, shareId }: { taskId: string; shareId: string }) {
  const t = useTranslations("task");
  const tCommon = useTranslations("common");
  const bound = revokeTaskShare.bind(null, taskId, shareId);

  return (
    <StandardActionButton
      action={bound}
      successMessage={t("accessRemoved")}
      title={tCommon("remove")}
      variant="danger"
      compact
      pendingTitle={t("removing")}
      confirmMessage={t("revokeShareConfirm")}
    />
  );
}
