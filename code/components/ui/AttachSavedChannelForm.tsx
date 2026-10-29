"use client";

import { attachSavedChannel } from "@/app/tasks/actions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";

// "Use a saved channel" on a task page — owner only. Lists the owner's
// account-level notification channels this task doesn't use yet.
export function AttachSavedChannelForm({
  taskId,
  saved,
}: {
  taskId: string;
  saved: { id: string; label: string; channelLabel: string }[];
}) {
  const bound = attachSavedChannel.bind(null, taskId);

  if (saved.length === 0) {
    return (
      <p className="text-sm text-muted">
        No other saved channels in your account. Tick &ldquo;Save to my account&rdquo; when adding one below, or add
        them on the{" "}
        <a href="/notification-channels" className="text-primary underline">
          Notifications
        </a>{" "}
        page, to reuse them across tasks.
      </p>
    );
  }

  return (
    <form action={bound} className="space-y-4 max-w-xl">
      <p className="text-sm font-semibold text-ink">Use a saved channel</p>
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="attach-channel">
          Saved channel
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
          On success
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="notifyOnFailure" defaultChecked />
          On failure
        </label>
      </div>
      <StandardSubmitButton title="Use this channel" />
    </form>
  );
}
