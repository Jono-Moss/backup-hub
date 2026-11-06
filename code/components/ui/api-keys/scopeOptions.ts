import type { Scope } from "@/db/schema";

// One vocabulary for permissions, shared by API keys and task sharing.
export const SCOPE_OPTIONS: { value: Scope; label: string; hint: string }[] = [
  { value: "tasks:read", label: "View tasks", hint: "List tasks and run history" },
  { value: "tasks:write", label: "Manage tasks", hint: "Create, update, delete tasks" },
  { value: "runs:trigger", label: "Trigger backups", hint: "Start a manual backup" },
  { value: "runs:download", label: "Download backups", hint: "Download backup files" },
  { value: "runs:delete", label: "Delete backups", hint: "Delete backup files" },
];

export function scopeLabel(scope: Scope): string {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? scope;
}
