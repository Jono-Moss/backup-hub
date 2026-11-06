"use client";

import { useTranslations } from "next-intl";
import { useDefinitionText } from "@/components/ui/common/useDefinitionText";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { useState } from "react";
import { attachSavedDestination } from "@/app/tasks/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

type SavedDestination = {
  id: string;
  label: string;
  type: string;
  supportsSubfolder: boolean;
};

// "Use a saved location" on a task page — owner only. Lists the owner's
// account-level save locations this task doesn't use yet.
export function AttachSavedDestinationForm({
  taskId,
  taskName,
  saved,
  providerLabels,
}: {
  taskId: string;
  taskName: string;
  saved: SavedDestination[];
  providerLabels: Record<string, string>;
}) {
  const t = useTranslations("locations");
  const text = useDefinitionText("destinations");
  const [selectedId, setSelectedId] = useState(saved[0]?.id ?? "");
  const selected = saved.find((d) => d.id === selectedId);
  const bound = attachSavedDestination.bind(null, taskId);

  if (saved.length === 0) {
    return (
      <p className="text-sm text-muted">
        {t.rich("noOtherSaved", {
          link: (chunks) => (
            <a href="/locations" className="text-primary underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    );
  }

  return (
    <ActionForm action={bound} success={t("addedToTask")} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="attach-destination">
            {t("savedLocation")}
          </label>
          <select
            id="attach-destination"
            name="destinationId"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {saved.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} — {text(`${d.type}.label`, providerLabels[d.type] ?? d.type)}
              </option>
            ))}
          </select>
        </div>
        {selected?.supportsSubfolder && (
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="attach-subfolder">
              {t("subfolder")}
            </label>
            <input
              key={selected.id}
              id="attach-subfolder"
              name="subfolder"
              defaultValue={taskName}
              className="w-full border border-line px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted mt-1">
              {t("subfolderHint")}
            </p>
          </div>
        )}
      </div>
      <StandardSubmitButton title={t("useThis")} />
    </ActionForm>
  );
}
