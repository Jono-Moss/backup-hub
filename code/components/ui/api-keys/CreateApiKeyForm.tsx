"use client";

import { useState } from "react";
import { createApiKey } from "@/app/api-keys/actions";
import { useScopes } from "@/components/ui/api-keys/scopeOptions";
import { useTranslations } from "next-intl";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { useAddPanel } from "@/components/ui/common/AddableSection";
import { useToast } from "@/components/ui/common/ToastProvider";
import { useActionFeedback } from "@/components/ui/common/useActionFeedback";


export function CreateApiKeyForm({ tasks }: { tasks: { id: string; name: string }[] }) {
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const panel = useAddPanel();
  const toast = useToast();
  const run = useActionFeedback();
  const t = useTranslations("apiKeys");
  const scopes = useScopes();

  async function handleSubmit(formData: FormData) {
    await run(async () => {
      const result = await createApiKey(formData);
      if (result.ok) setIssuedKey(result.key);
      return result;
    }, { success: t("created") });
  }

  if (issuedKey) {
    return (
      <div className="border border-primary bg-primary-light p-5 rounded-md">
        <p className="text-sm font-medium text-ink mb-2">
          {t("createdBanner")}
        </p>
        <code className="block bg-white border border-line px-3 py-2 text-xs font-mono break-all mb-2">{issuedKey}</code>
        <StandardActionButton
          action={() => {
            setIssuedKey(null);
            panel?.close();
            toast.success(t("savedToast"));
          }}
          title={t("done")}
        />
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="name">
          {t("keyName")}
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder={t("keyNamePlaceholder")}
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="taskId">
          {t("scopeTask")}
        </label>
        <select id="taskId" name="taskId" className="w-full border border-line px-3 py-2 text-sm bg-white">
          <option value="">{t("allTasks")}</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-sm text-ink mb-2">{t("permissions")}</p>
        <div className="space-y-2">
          {scopes.options.map((scope) => (
            <label key={scope.value} className="flex items-start gap-2">
              <input type="checkbox" name="scopes" value={scope.value} className="mt-0.5" />
              <span className="text-sm">
                <span className="text-ink">{scope.label}</span>{" "}
                <span className="text-muted">— {scope.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <StandardSubmitButton
        title={t("create")}
        pendingTitle={t("creating")}
      />
    </form>
  );
}