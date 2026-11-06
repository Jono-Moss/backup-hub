"use client";

import { useTranslations } from "next-intl";
import { deleteUser } from "@/app/users/actions";
import { DeleteWithFilesButton } from "@/components/ui/common/DeleteWithFilesButton";

export function DeleteUserButton({ userId }: { userId: string }) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  return (
    <DeleteWithFilesButton
      buttonTitle={tCommon("delete")}
      compact
      heading={t("deleteHeading")}
      description={t("deleteDescription")}
      keepNote={t("deleteKeepNote")}
      confirmLabel={t("deleteUser")}
      successMessage={t("deleted")}
      onDelete={(deleteFiles) => deleteUser(userId, deleteFiles)}
    />
  );
}
