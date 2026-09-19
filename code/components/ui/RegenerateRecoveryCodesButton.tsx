"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { regenerateRecoveryCodes } from "@/app/account/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function RegenerateRecoveryCodesButton() {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <div className="space-y-3 border border-primary bg-primary-light p-4">
        <p className="text-sm font-medium text-ink">
          New recovery codes — save these now, they won't be shown again.
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
          title="Done"
        />
      </div>
    );
  }

  return (
    <StandardActionButton
      action={async () => {
        const result = await regenerateRecoveryCodes();
        setCodes(result.recoveryCodes);
      }}
      title="Regenerate recovery codes"
      pendingTitle="Generating…"
      confirmMessage="Generate new recovery codes? Your existing codes will stop working."
    />
  );
}