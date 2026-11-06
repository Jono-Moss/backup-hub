"use client";

import { shareTask } from "@/app/tasks/actions";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { useScopes } from "@/components/ui/api-keys/scopeOptions";
import { useTranslations } from "next-intl";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

export function ShareTaskForm({ taskId }: { taskId: string }) {
  const t = useTranslations("sharing");
  const scopes = useScopes();
  return (
    <ActionForm
      action={(formData) => shareTask(taskId, formData)}
      success={t("saved")}
      resetOnSuccess
      className="space-y-4"
    >
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="share-email">
          {t("userEmail")}
        </label>
        <input
          id="share-email"
          name="email"
          type="email"
          required
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        {scopes.options.map((scope) => (
          <label key={scope.value} className="flex items-start gap-2">
            <input
              type="checkbox"
              name="scopes"
              value={scope.value}
              className="mt-0.5"
              defaultChecked={scope.value === "tasks:read"}
              disabled={scope.value === "tasks:read"}
            />
            <span className="text-sm">
              <span className="text-ink">{scope.label}</span> <span className="text-muted">— {scope.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted">
        {t("note")}
      </p>

      <StandardSubmitButton title={t("share")} pendingTitle={t("sharing")} />
    </ActionForm>
  );
}
