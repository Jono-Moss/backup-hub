"use client";

import { useState } from "react";
import { shareTask } from "@/app/tasks/actions";
import { SCOPE_OPTIONS } from "./scopeOptions";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";

export function ShareTaskForm({ taskId }: { taskId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await shareTask(taskId, formData);
    setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.message });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="share-email">
          User&apos;s email
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
        {SCOPE_OPTIONS.map((scope) => (
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
        Restoring a backup into the database is never shareable — only you can do that. Share again with the same
        email to change someone&apos;s permissions.
      </p>

      <div className="flex items-center gap-4">
        <StandardSubmitButton title="Share" pendingTitle="Sharing..." />
        {message && <span className={`text-sm ${message.ok ? "text-primary" : "text-danger"}`}>{message.text}</span>}
      </div>
    </form>
  );
}
