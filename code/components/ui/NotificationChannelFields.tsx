"use client";

import { useRef, useState } from "react";
import { sendTestNotification } from "@/app/tasks/actions";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/db/schema";
import { NOTIFICATION_CHANNEL_DEFINITIONS } from "@/lib/notifications/channels/definitions";
import { StandardActionButton } from "./standard/StandardActionButton";

// Channel dropdown + that channel's fields + a "Send test" button. Rendered
// inside both add-recipient forms (task and system); the fields are
// generated from lib/notifications/channels/definitions.ts.
export function NotificationChannelFields({ idPrefix }: { idPrefix: string }) {
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const definition = NOTIFICATION_CHANNEL_DEFINITIONS[channel];

  async function handleTest() {
    const form = wrapperRef.current?.closest("form");
    if (!form) return;
    if (!form.reportValidity()) return;
    setResult(await sendTestNotification(new FormData(form)));
  }

  return (
    <div ref={wrapperRef} className="space-y-4">
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor={`${idPrefix}-channel`}>
          Send via
        </label>
        <select
          id={`${idPrefix}-channel`}
          name="channel"
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value as NotificationChannel);
            setResult(null);
          }}
          className="w-full border border-line px-3 py-2 text-sm bg-white"
        >
          {NOTIFICATION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {NOTIFICATION_CHANNEL_DEFINITIONS[c].label}
            </option>
          ))}
        </select>
      </div>

      {definition.fields.map((field) => (
        <div key={`${channel}-${field.name}`}>
          <label className="block text-sm text-ink mb-1" htmlFor={`${idPrefix}-${field.name}`}>
            {field.label}
            {field.required && <span className="text-danger"> *</span>}
          </label>
          <input
            id={`${idPrefix}-${field.name}`}
            name={field.name}
            type={field.type}
            required={field.required}
            placeholder={field.placeholder}
            defaultValue={field.defaultValue}
            autoComplete="off"
            className="w-full border border-line px-3 py-2 text-sm"
          />
          {field.helpText && <p className="text-xs text-muted mt-1">{field.helpText}</p>}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <StandardActionButton action={handleTest} variant="outline" title="Send test" pendingTitle="Sending…" compact />
        {result && (
          <span className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
            {result.ok ? `Test notification sent${result.message ? ` — ${result.message}` : ""}` : `Failed: ${result.message ?? "unknown error"}`}
          </span>
        )}
      </div>
    </div>
  );
}
