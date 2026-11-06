"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteLocation, makeLocationReusable, testLocation } from "@/app/locations/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function TestLocationButton({ id }: { id: string }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      <StandardActionButton
        action={async () => setResult(await testLocation(id))}
        title={t("test")}
        variant="outline"
        pendingTitle={t("testing")}
        compact
      />
      {result && (
        <span className={`text-xs ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? result.message ?? t("ok") : t("failedWhy", { reason: result.message ?? t("unknownError") })}
        </span>
      )}
    </div>
  );
}

export function DeleteLocationButton({ id, usedByCount }: { id: string; usedByCount: number }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      action={() => deleteLocation(id)}
      successMessage={t("deleted")}
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

export function MakeReusableButton({ id }: { id: string }) {
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  return (
    <StandardActionButton
      action={() => makeLocationReusable(id)}
      successMessage={t("madeReusable")}
      title={t("makeReusable")}
      variant="outline"
      pendingTitle={t("saving")}
      confirmMessage={t("makeReusableConfirm")}
      compact
    />
  );
}
