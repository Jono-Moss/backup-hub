"use client";

import { useState, useTransition } from "react";
import { deleteBackupRun, restoreBackupRun, clearFailedBackupRuns } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";
import { useModal } from "./modal/ModalProvider";

export function DeleteRunButton({ taskId, runId }: { taskId: string; runId: string }) {

  return (
    <StandardActionButton
      variant="danger"
      title="Delete"
      compact
      confirmMessage="Delete this backup file? This cannot be undone."
      action={() => deleteBackupRun(taskId, runId)}
    />
  );
}

export function ClearFailedRunsButton({ taskId }: { taskId: string }) {
  const { alertUser } = useModal();
  return (
    <StandardActionButton
      variant="outline"
      title="Remove all failed backups"
      pendingTitle="Removing..."
      confirmMessage="Remove all failed backup records for this task? This cannot be undone."
      action={async () => {
        const count = await clearFailedBackupRuns(taskId);
        alertUser(count === 0 ? "No failed backups to remove." : `Removed ${count} failed backup${count === 1 ? "" : "s"}.`);
      }}
    />
  );
}

const RESTORE_WARNING =
  "Restoring will overwrite the current contents of the live database with this backup's data. This cannot be undone.";

export function RestoreRunButton({
  taskId,
  runId,
  encrypted,
}: {
  taskId: string;
  runId: string;
  encrypted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { alertUser } = useModal();

  const runRestore = (pw?: string) => {
    setError(null);
    startTransition(async () => {
      const result = await restoreBackupRun(taskId, runId, pw);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setPassword("");
      alertUser("Restore completed successfully.");
    });
  };

  // Unencrypted backups don't need a password, so a plain confirm covers
  // it — no need for the modal.
  if (!encrypted) {
    return (
      <StandardActionButton
        variant="link"
        title="Restore"
        compact
        pendingTitle="Restoring..."
        confirmMessage={`Restore this backup? ${RESTORE_WARNING}`}
        action={() => runRestore(undefined)}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md text-primary text-xs font-medium px-2.5 py-1 hover:underline transition-colors"
      >
        Restore
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-md border border-line bg-white p-6 shadow-lg">
            <h2 className="text-base font-semibold text-ink mb-1">Restore this backup?</h2>
            <p className="text-sm text-muted mb-4">{RESTORE_WARNING}</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!password) {
                  setError("Enter the backup's encryption password.");
                  return;
                }
                runRestore(password);
              }}
            >
              <label className="block text-sm text-ink mb-1" htmlFor="restore-password">
                Encryption password
              </label>
              <input
                id="restore-password"
                name="restore-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="This backup's encryption password"
                className="w-full border border-line px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted mb-4">
                This is the password that was set on the task when this backup was taken — not necessarily the
                task's current password, if it's been changed since.
              </p>

              {error && <p className="text-sm text-danger mb-4">{error}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setPassword("");
                    setError(null);
                  }}
                  disabled={isPending}
                  className="rounded-md border border-line text-ink text-sm font-medium px-4 py-2 hover:border-primary disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-primary text-white text-sm font-medium px-4 py-2 border-b-primary-dark border-b-2 hover:border-b-transparent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPending ? "Restoring..." : "Restore"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}