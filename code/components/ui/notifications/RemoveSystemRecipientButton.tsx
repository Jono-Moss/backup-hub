"use client";

import { useTranslations } from "next-intl";
import { removeSystemRecipient } from "@/app/notifications/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RemoveSystemRecipientButton({ id }: { id: string }) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      action={() => removeSystemRecipient(id)}
      successMessage={t("recipientRemoved")}
      title={tCommon("remove")}
      variant="danger"
      compact
    />
  );
}
