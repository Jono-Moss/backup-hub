"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startTotpEnrollment, confirmTotpEnrollment } from "@/app/account/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

type Step = "idle" | "scanning" | "codes";

export function TotpEnrollFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function begin() {
    setError(null);

    const result = await startTotpEnrollment();
    setEnrollment(result);
    setStep("scanning");

  }

  async function confirm() {
    setError(null);

    try {
      const result = await confirmTotpEnrollment(code);
      setRecoveryCodes(result.recoveryCodes);
      setStep("codes");
    } catch (err: any) {
      setError(err.message ?? "Couldn't verify that code.");
    }

  }

  function finish() {
    setStep("idle");
    setEnrollment(null);
    setCode("");
    router.refresh();
  }

  if (step === "idle") {
    return (
      <StandardActionButton
        action={begin}
        title="Set up authenticator app"
        variant="outline"
      />
    );
  }

  if (step === "scanning" && enrollment) {
    return (
      <div className="rounded-md space-y-4 border border-line p-4">
        <p className="text-sm text-ink">
          Scan this with your authenticator app (1Password, Google Authenticator, Authy, etc.), then enter the
          6-digit code it shows.
        </p>
        <div className="flex justify-center">
          <img src={enrollment.qrDataUrl} alt="Authenticator QR code" width={240} height={240} />
        </div>
        <div>
          <p className="text-xs text-muted mb-1">Can't scan? Enter this key manually:</p>
          <code className="block bg-paper border border-line px-3 py-2 text-xs font-mono break-all">
            {enrollment.secret}
          </code>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm text-ink mb-1" htmlFor="totp-code">
              6-digit code
            </label>
            <input
              id="totp-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              placeholder="123456"
              className="w-full border border-line px-3 py-2 text-sm font-mono tracking-widest"
            />
          </div>
          <StandardActionButton
            action={confirm}
            disabled={code.length < 6}
            title="Verify & enable"
            pendingTitle="Verifying…"
          />
        </div>
      </div>
    );
  }

  if (step === "codes") {
    return (
      <div className="rounded-md space-y-4 border border-primary bg-primary-light p-4">
        <p className="text-sm font-medium text-ink">
          Two-factor authentication is on. Save these recovery codes somewhere safe — each works once, and they
          won't be shown again. Use one if you lose access to your authenticator app.
        </p>
        <div className="grid grid-cols-2 gap-2 bg-white border border-line p-3">
          {recoveryCodes.map((c) => (
            <code key={c} className="text-xs font-mono">
              {c}
            </code>
          ))}
        </div>
        <StandardActionButton
          action={finish}
          title="I've saved these"
        />
      </div>
    );
  }

  return null;
}