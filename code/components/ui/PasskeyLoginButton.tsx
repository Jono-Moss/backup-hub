"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { startPasskeyLogin, finishPasskeyLogin } from "@/app/login/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function PasskeyLoginButton({ next }: { next: string }) {
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
          ? "Cancelled."
          : err?.message ?? "Passkey sign-in failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StandardActionButton
        action={handleClick}
        title="Sign in with a passkey"
        pendingTitle="Waiting for passkey…"
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