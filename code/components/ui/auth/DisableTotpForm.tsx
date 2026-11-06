"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { disableTotp } from "@/app/account/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { useToast } from "@/components/ui/common/ToastProvider";

export function DisableTotpForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const t = useTranslations("twoFactor");
  const tCommon = useTranslations("common");
  const tAccount = useTranslations("account");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-danger text-sm hover:underline">
        {t("disableLink")}
      </button>
    );
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const result = await disableTotp(formData);
      if (result && !result.ok) return setError(result.message);
      setOpen(false);
      toast.success(t("turnedOff"));
    } catch {
      setError(tCommon("genericError"));
    }
  }

  return (
    <form action={handleSubmit} className="rounded-md space-y-3 border border-danger bg-danger-light p-4">
      <p className="text-sm text-ink">{t("disablePrompt")}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <input
        name="password"
        type="password"
        required
        autoFocus
        placeholder={tAccount("currentPassword")}
        className="w-full border border-line px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <StandardSubmitButton title={t("disable")} variant="danger" pendingTitle={t("disabling")} />
        <StandardActionButton action={() => setOpen(false)} title={tCommon("cancel")} />
      </div>
    </form>
  );
}
