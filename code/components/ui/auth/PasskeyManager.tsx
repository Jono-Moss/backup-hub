"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { startPasskeyRegistration, finishPasskeyRegistration, deletePasskey } from "@/app/account/actions";
import { LocalTime } from "@/components/ui/common/LocalTime";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { LuPlus } from "react-icons/lu";
import { useModal } from "@/components/ui/modal/ModalProvider";
import { useToast } from "@/components/ui/common/ToastProvider";
import { isActionFailure } from "@/lib/action-result";

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
  const toast = useToast();

  function addPasskey() {
    setError(null);
    const name = window.prompt("Name this passkey (e.g. \"MacBook\", \"YubiKey\"):", "Passkey");
    if (name === null) return; // cancelled

    startTransition(async () => {
      try {
        const options = await startPasskeyRegistration();
        const response = await startRegistration({ optionsJSON: options });
        const result = await finishPasskeyRegistration(name, response);
        if (isActionFailure(result)) return setError(result.message);
        toast.success("Passkey added");
        router.refresh();
      } catch (err: any) {
        // Errors from the browser's passkey prompt (not the server) keep their own message.
        setError(err?.name === "NotAllowedError" ? "Cancelled." : err?.message ?? "Couldn't add that passkey.");
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
      try {
        await deletePasskey(id);
        toast.success("Passkey removed");
        router.refresh();
      } catch {
        toast.error("Couldn't remove that passkey — please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {passkeys.length > 0 ? (
        <StandardEntryList>
          {passkeys.map((p) => (
            <StandardEntryCard
              key={p.id}
              title={p.name}
              meta={
                <>
                  Added <LocalTime value={p.createdAt} options={DATE_OPTIONS} />
                  {p.lastUsedAt ? (
                    <>
                      {" · last used "}
                      <LocalTime value={p.lastUsedAt} options={DATE_OPTIONS} />
                    </>
                  ) : (
                    " · never used"
                  )}
                </>
              }
              actions={
                <button
                  onClick={() => removePasskey(p.id)}
                  disabled={isPending}
                  className="text-danger text-sm hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              }
            />
          ))}
        </StandardEntryList>
      ) : (
        <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          No passkeys yet.
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={addPasskey}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white border-b-2 border-b-primary-dark hover:border-b-transparent shadow-inner disabled:opacity-50"
      >
        <LuPlus size={16} aria-hidden="true" />
        {isPending ? "Working…" : "Add a passkey"}
      </button>
    </div>
  );
}