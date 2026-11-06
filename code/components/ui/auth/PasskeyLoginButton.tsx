"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { startPasskeyLogin, finishPasskeyLogin } from "@/app/login/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";

export function PasskeyLoginButton({ next }: { next: string }) {
  const t = useTranslations("auth");
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const options = await startPasskeyLogin();

      const response = await startAuthentication({
        optionsJSON: options,
      });
      const result = await finishPasskeyLogin(response);
      if (result.ok) {
        router.push(next || "/");
        router.refresh();
        return;
      }
      setError(result.error);
    } catch (err: any) {
      console.error("Passkey login error:", err);

      setError(
        err?.name === "NotAllowedError"
          ? t("passkeyCancelled")
          : err?.message ?? t("passkeyFailed")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StandardActionButton
        action={handleClick}
        title={t("passkeySignIn")}
        pendingTitle={t("passkeyWaiting")}
        variant="outline"
        fullWidth
      />

      {error && (
        <p className="mt-2 text-sm text-danger text-center">
          {error}
        </p>
      )}
    </div>
  );
}