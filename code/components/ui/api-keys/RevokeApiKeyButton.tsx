"use client";

import { useTranslations } from "next-intl";
import { revokeApiKey } from "@/app/api-keys/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RevokeApiKeyButton({ id }: { id: string }) {
  const t = useTranslations("apiKeys");
  return (
    <StandardActionButton
      title={t("revoke")}
      variant="danger"
      compact
      pendingTitle={t("revoking")}
      confirmMessage={t("revokeConfirm")}
      action={() => revokeApiKey(id)}
      successMessage={t("revoked")}
    />
  );
}