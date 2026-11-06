"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { regenerateRecoveryCodes } from "@/app/account/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function RegenerateRecoveryCodesButton() {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);
  const t = useTranslations("twoFactor");

  if (codes) {
    return (
      <div className="space-y-3 border border-primary bg-primary-light p-4">
        <p className="text-sm font-medium text-ink">
          {t("newCodes")}
        </p>
        <div className="grid grid-cols-2 gap-2 bg-white border border-line p-3">
          {codes.map((c) => (
            <code key={c} className="text-xs font-mono">
              {c}
            </code>
          ))}
        </div>
        <StandardActionButton
          action={() => {
            setCodes(null);
            router.refresh();
          }}
          title={t("done")}
        />
      </div>
    );
  }

  return (
    <StandardActionButton
      action={async () => {
        const result = await regenerateRecoveryCodes();
        if ("recoveryCodes" in result) setCodes(result.recoveryCodes);
        return result;
      }}
      title={t("regenerate")}
      pendingTitle={t("generating")}
      confirmMessage={t("regenerateConfirm")}
    />
  );
}