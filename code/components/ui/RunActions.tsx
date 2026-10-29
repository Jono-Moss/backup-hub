"use client";

import { useState, useTransition, type ReactNode } from "react";
import { LuDatabaseZap, LuDownload, LuHistory, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import {
  deleteBackupRun,
  restoreBackupRun,
  verifyBackupRun,
  testRestoreBackupRun,
} from "@/app/tasks/actions";
import { StandardLinkButton } from "./standard/StandardLinkButton";
import { ActionMenu, type MenuAction } from "./ActionMenu";
import { useModal } from "./modal/ModalProvider";

const RESTORE_WARNING =
  "Restoring will overwrite the current contents of the live database with this backup's data. This cannot be undone.";

interface RunActionsProps {
  taskId: string;
  run: { id: string; status: string; encrypted: boolean };
  can: { download: boolean; restore: boolean; deleteRuns: boolean; trigger: boolean };
  /** Test restores are set up on this server for the task's engine. */
  testRestore: boolean;
  /** A check is already queued or running for this backup. */
  checking: boolean;
  /** Desktop table: Download stays visible next to a ⋯ dropdown. Phones: one ⋯ opening a bottom drawer. */
  variant: "desktop" | "mobile";
  /** Drawer header — which backup the actions apply to. */
  title?: ReactNode;
  summary?: ReactNode;
}

// Everything you can do with one backup in the history list.
export function RunActions({ taskId, run, can, testRestore, checking, variant, title, summary }: RunActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const { confirm, alertUser } = useModal();
  const completed = run.status === "completed";
  const downloadHref = `/tasks/${taskId}/runs/${run.id}/download`;

  const runAction = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        alertUser(err instanceof Error ? err.message : String(err));
      }
    });

  // Confirmations are asked *before* starting the transition: React holds
  // back state updates made inside a transition until it finishes, so a
  // dialog opened from inside one could never appear.
  const restore = async () => {
    // Encrypted backups need their password, so they get the dialog; plain
    // ones just need a confirmation.
    if (run.encrypted) return setRestoreOpen(true);
    const ok = await confirm({ title: "Restore this backup?", message: RESTORE_WARNING, confirmLabel: "Restore", danger: true });
    if (!ok) return;
    runAction(async () => {
      const result = await restoreBackupRun(taskId, run.id);
      alertUser(result.ok ? "Restore completed successfully." : result.message);
    });
  };

  const actions: MenuAction[] = [];
  if (completed && can.download && variant === "mobile") {
    actions.push({ key: "download", label: "Download", icon: LuDownload, href: downloadHref });
  }
  if (completed && can.restore) {
    actions.push({ key: "restore", label: "Restore…", icon: LuHistory, description: "Overwrite the live database with this backup", onSelect: restore });
  }
  if (completed && can.trigger) {
    actions.push({
      key: "verify",
      label: "Verify file",
      icon: LuShieldCheck,
      description: "Check it's intact and reads back completely",
      disabled: checking,
      onSelect: () => runAction(() => verifyBackupRun(taskId, run.id)),
    });
    if (testRestore) {
      actions.push({
        key: "test-restore",
        label: "Test restore",
        icon: LuDatabaseZap,
        description: "Restore into a temporary database, check it, then delete it",
        disabled: checking,
        onSelect: () => runAction(() => testRestoreBackupRun(taskId, run.id)),
      });
    }
  }
  if (can.deleteRuns) {
    actions.push({
      key: "delete",
      label: "Delete…",
      icon: LuTrash2,
      description: "Remove this backup file",
      danger: true,
      onSelect: async () => {
        const ok = await confirm({ title: "Delete this backup?", message: "The backup file is deleted. This cannot be undone.", confirmLabel: "Delete", danger: true });
        if (ok) runAction(() => deleteBackupRun(taskId, run.id));
      },
    });
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
        {variant === "desktop" && completed && can.download && (
          <StandardLinkButton href={downloadHref} title="Download" compact />
        )}
        <ActionMenu
          actions={actions}
          variant={variant === "desktop" ? "dropdown" : "sheet"}
          label="Backup actions"
          title={title}
          summary={summary}
          busy={isPending}
        />
      </div>
      {restoreOpen && <RestorePasswordDialog taskId={taskId} runId={run.id} onClose={() => setRestoreOpen(false)} />}
    </>
  );
}

function RestorePasswordDialog({ taskId, runId, onClose }: { taskId: string; runId: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { alertUser } = useModal();

  const submit = () => {
    if (!password) return setError("Enter the backup's encryption password.");
    setError(null);
    startTransition(async () => {
      const result = await restoreBackupRun(taskId, runId, password);
      if (!result.ok) return setError(result.message);
      onClose();
      alertUser("Restore completed successfully.");
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-md border border-line bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-ink mb-1">Restore this backup?</h2>
        <p className="text-sm text-muted mb-4">{RESTORE_WARNING}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
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
            This is the password that was set on the task when this backup was taken — not necessarily the task's
            current password, if it's been changed since.
          </p>

          {error && <p className="text-sm text-danger mb-4">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
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
  );
}
