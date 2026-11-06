"use client";

import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { attachSavedChannel } from "@/app/tasks/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";

// "Use a saved channel" on a task page — owner only. Lists the owner's
// account-level notification channels this task doesn't use yet.
export function AttachSavedChannelForm({
  taskId,
  saved,
}: {
  taskId: string;
  saved: { id: string; label: string; channelLabel: string }[];
}) {
  const t = useTranslations("notifications");
  const bound = attachSavedChannel.bind(null, taskId);

  if (saved.length === 0) {
    return (
      <p className="text-sm text-muted">
        {t.rich("noOtherSaved", {
          link: (chunks) => (
            <a href="/notification-channels" className="text-primary underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    );
  }

  return (
    <ActionForm action={bound} success={t("channelAddedToTask")} className="space-y-4 max-w-xl">
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="attach-channel">
          {t("savedChannel")}
        </label>
        <select
          id="attach-channel"
          name="channelId"
          className="w-full border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {saved.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {c.channelLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="notifyOnSuccess" />
          {t("onSuccess")}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="notifyOnFailure" defaultChecked />
          {t("onFailure")}
        </label>
      </div>
      <StandardSubmitButton title={t("useThisChannel")} />
    </ActionForm>
  );
}
