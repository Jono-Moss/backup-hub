"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteChannelById, makeChannelReusable, testChannel } from "@/app/notification-channels/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function TestChannelButton({ id }: { id: string }) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      <StandardActionButton
        action={async () => setResult(await testChannel(id))}
        title={t("sendTest")}
        variant="outline"
        pendingTitle={t("sending")}
        compact
      />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? t("sent") : t("failedWhy", { reason: result.message ?? t("unknownError") })}
        </span>
      )}
    </div>
  );
}

export function DeleteChannelButton({ id, usedByCount }: { id: string; usedByCount: number }) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      action={() => deleteChannelById(id)}
      successMessage={t("channelDeleted")}
      title={tCommon("delete")}
      variant="danger"
      pendingTitle={t("deleting")}
      confirmMessage={
        usedByCount > 0
          ? t("deleteUsedConfirm", { count: usedByCount })
          : t("deleteUnusedConfirm")
      }
      compact
    />
  );
}

export function MakeChannelReusableButton({ id }: { id: string }) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      action={() => makeChannelReusable(id)}
      successMessage={t("madeReusable")}
      title={t("makeReusable")}
      variant="outline"
      pendingTitle={t("saving")}
      confirmMessage={t("makeReusableConfirm")}
      compact
    />
  );
}
