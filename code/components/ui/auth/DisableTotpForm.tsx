"use client";

import { useState } from "react";
import { disableTotp } from "@/app/account/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { useToast } from "@/components/ui/common/ToastProvider";

export function DisableTotpForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-danger text-sm hover:underline">
        Disable two-factor authentication
      </button>
    );
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const result = await disableTotp(formData);
      if (result && !result.ok) return setError(result.message);
      setOpen(false);
      toast.success("Two-factor authentication turned off");
    } catch {
      setError("Something went wrong — please try again.");
    }
  }

  return (
    <form action={handleSubmit} className="rounded-md space-y-3 border border-danger bg-danger-light p-4">
      <p className="text-sm text-ink">Enter your password to disable two-factor authentication.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <input
        name="password"
        type="password"
        required
        autoFocus
        placeholder="Current password"
        className="w-full border border-line px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <StandardSubmitButton title="Disable" variant="danger" pendingTitle="Disabling…" />
        <StandardActionButton action={() => setOpen(false)} title="Cancel" />
      </div>
    </form>
  );
}
