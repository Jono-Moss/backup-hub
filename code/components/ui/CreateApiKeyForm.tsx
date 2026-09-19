"use client";

import { useState } from "react";
import { createApiKey } from "@/app/api-keys/actions";
import type { Scope } from "@/db/schema";
import { StandardActionButton } from "./standard/StandardActionButton";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";

const SCOPE_OPTIONS: { value: Scope; label: string; hint: string }[] = [
  { value: "tasks:read", label: "View tasks", hint: "List tasks and run history" },
  { value: "tasks:write", label: "Manage tasks", hint: "Create, update, delete tasks" },
  { value: "runs:trigger", label: "Trigger backups", hint: "Start a manual backup" },
  { value: "runs:download", label: "Download backups", hint: "Download backup files" },
  { value: "runs:delete", label: "Delete backups", hint: "Delete backup files" },
];

export function CreateApiKeyForm({ tasks }: { tasks: { id: string; name: string }[] }) {
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const raw = await createApiKey(formData);
    setIssuedKey(raw);
  }

  if (issuedKey) {
    return (
      <div className="border border-primary bg-primary-light p-5 rounded-md">
        <p className="text-sm font-medium text-ink mb-2">
          Key created — copy it now, it won&apos;t be shown again.
        </p>
        <code className="block bg-white border border-line px-3 py-2 text-xs font-mono break-all mb-2">{issuedKey}</code>
        <StandardActionButton
          action={() => setIssuedKey(null)}
          title="Done"
        />
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="name">
          Key name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Main app server"
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="taskId">
          Scope to a single task (optional)
        </label>
        <select id="taskId" name="taskId" className="w-full border border-line px-3 py-2 text-sm bg-white">
          <option value="">All tasks</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-sm text-ink mb-2">Permissions</p>
        <div className="space-y-2">
          {SCOPE_OPTIONS.map((scope) => (
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
        title="Create key"
        pendingTitle="Creating…"
      />
    </form>
  );
}