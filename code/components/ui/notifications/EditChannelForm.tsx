"use client";

import { useTranslations } from "next-intl";
import { useDefinitionText } from "@/components/ui/common/useDefinitionText";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { testEditedChannel, updateChannel } from "@/app/notification-channels/actions";
import type { NotificationChannel } from "@/db/schema";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "@/lib/notifications/channels/definitions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { ActionForm } from "@/components/ui/common/ActionForm";

// Password-type fields (tokens, webhook URLs) are never sent to the browser:
// their inputs start blank, and leaving one blank keeps the saved value.
export function EditChannelForm({
  channel,
}: {
  channel: { id: string; label: string; channel: NotificationChannel; values: Record<string, string>; secretsSet: string[] };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const update = updateChannel.bind(null, channel.id);
  const definition = NOTIFICATION_CHANNEL_DEFINITIONS[channel.channel];
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const text = useDefinitionText("channels");

  return (
    <ActionForm
      formRef={formRef}
      action={update}
      success={t("channelUpdated")}
      onSuccess={() => router.push("/notification-channels")}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="channel-label">
          {t("name")}
        </label>
        <input
          id="channel-label"
          name="label"
          defaultValue={channel.label}
          required
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      {definition.fields.map((field) => {
        const secret = field.type === "password";
        const isSet = channel.secretsSet.includes(field.name);
        return (
          <div key={field.name}>
            <label className="block text-sm text-ink mb-1" htmlFor={`channel-${field.name}`}>
              {text(`${channel.channel}.fields.${field.name}.label`, field.label)}
              {field.required && !(secret && isSet) && <span className="text-danger"> *</span>}
            </label>
            <input
              id={`channel-${field.name}`}
              name={field.name}
              type={field.type}
              autoComplete="off"
              required={field.required && !(secret && isSet)}
              defaultValue={secret ? "" : channel.values[field.name] ?? ""}
              placeholder={secret && isSet ? t("secretSaved") : text(`${channel.channel}.fields.${field.name}.placeholder`, field.placeholder)}
              className="w-full border border-line px-3 py-2 text-sm"
            />
            {field.helpText && <p className="text-xs text-muted mt-1">{text(`${channel.channel}.fields.${field.name}.helpText`, field.helpText)}</p>}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <StandardActionButton
          action={async () => {
            if (formRef.current) setResult(await testEditedChannel(channel.id, new FormData(formRef.current)));
          }}
          variant="outline"
          title={t("sendTest")}
          pendingTitle={t("sending")}
        />
        <StandardSubmitButton title={t("saveChanges")} />
        <a href="/notification-channels" className="text-sm text-muted hover:text-ink">
          {tCommon("cancel")}
        </a>
      </div>
      {result && (
        <p className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok
            ? result.message
              ? t("testSentDetail", { detail: result.message })
              : t("testSent")
            : t("failedWhy", { reason: result.message ?? t("unknownError") })}
        </p>
      )}
    </ActionForm>
  );
}
