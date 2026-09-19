"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { startPasskeyRegistration, finishPasskeyRegistration, deletePasskey } from "@/app/account/actions";
import { LocalTime } from "@/components/ui/LocalTime";
import { useModal } from "@/components/ui/modal/ModalProvider";

type Passkey = {
  id: string;
  name: string;
  deviceType: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useModal();

  function addPasskey() {
    setError(null);
    const name = window.prompt("Name this passkey (e.g. \"MacBook\", \"YubiKey\"):", "Passkey");
    if (name === null) return; // cancelled

    startTransition(async () => {
      try {
        const options = await startPasskeyRegistration();
        const response = await startRegistration({ optionsJSON: options });
        await finishPasskeyRegistration(name, response);
        router.refresh();
      } catch (err: any) {
        setError(err?.name === "NotAllowedError" ? "Cancelled." : err.message ?? "Couldn't add that passkey.");
      }
    });
  }

  async function removePasskey(id: string) {
    const confirmed = await confirm({
      message: "Remove this passkey? You'll no longer be able to sign in with it.",
      danger: true,
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    startTransition(async () => {
      await deletePasskey(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {passkeys.length > 0 && (
        <div className="divide-y divide-line">
          {passkeys.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm text-ink">{p.name}</p>
                <p className="text-xs text-muted">
                  Added <LocalTime value={p.createdAt} options={DATE_OPTIONS} />
                  {p.lastUsedAt ? (
                    <>
                      {" · last used "}
                      <LocalTime value={p.lastUsedAt} options={DATE_OPTIONS} />
                    </>
                  ) : (
                    " · never used"
                  )}
                </p>
              </div>
              <button
                onClick={() => removePasskey(p.id)}
                disabled={isPending}
                className="text-danger text-sm hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={addPasskey}
        disabled={isPending}
        className="border border-line text-ink text-sm font-medium px-4 py-2 hover:border-primary transition-colors disabled:opacity-50"
      >
        {isPending ? "Working…" : "Add a passkey"}
      </button>
    </div>
  );
}