"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("passkeys");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const time = (value: Date | string) => () => <LocalTime value={value} options={DATE_OPTIONS} />;

  function addPasskey() {
    setError(null);
    const name = window.prompt(t("namePrompt"), t("defaultName"));
    if (name === null) return; // cancelled

    startTransition(async () => {
      try {
        const options = await startPasskeyRegistration();
        const response = await startRegistration({ optionsJSON: options });
        const result = await finishPasskeyRegistration(name, response);
        if (isActionFailure(result)) return setError(result.message);
        toast.success(t("added"));
        router.refresh();
      } catch (err: any) {
        // Errors from the browser's passkey prompt (not the server) keep their own message.
        setError(err?.name === "NotAllowedError" ? tAuth("passkeyCancelled") : err?.message ?? t("addFailed"));
      }
    });
  }

  async function removePasskey(id: string) {
    const confirmed = await confirm({
      message: t("removeConfirm"),
      danger: true,
      confirmLabel: tCommon("remove"),
    });
    if (!confirmed) return;
    startTransition(async () => {
      try {
        await deletePasskey(id);
        toast.success(t("removed"));
        router.refresh();
      } catch {
        toast.error(t("removeFailed"));
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
                  {t.rich("addedOn", { time: time(p.createdAt) })}
                  {" · "}
                  {p.lastUsedAt ? t.rich("lastUsed", { time: time(p.lastUsedAt) }) : t("neverUsed")}
                </>
              }
              actions={
                <button
                  onClick={() => removePasskey(p.id)}
                  disabled={isPending}
                  className="text-danger text-sm hover:underline disabled:opacity-50"
                >
                  {tCommon("remove")}
                </button>
              }
            />
          ))}
        </StandardEntryList>
      ) : (
        <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {t("none")}
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
        {isPending ? t("working") : t("add")}
      </button>
    </div>
  );
}