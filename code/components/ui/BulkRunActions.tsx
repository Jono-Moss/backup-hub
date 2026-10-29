"use client";

import { useTransition } from "react";
import { LuDatabaseZap, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import { clearFailedBackupRuns, testRestoreAllBackupRuns, verifyAllBackupRuns } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";
import { ActionMenu, type MenuAction } from "./ActionMenu";
import { useModal } from "./modal/ModalProvider";

// Actions on all of a task's backups at once, in the Backup history header.
// They use the same icons as the matching per-backup actions (Verify file,
// Test restore, Delete). Wider screens get compact icon + text buttons;
// phones get one ⋯ opening an "All backups" drawer, like each backup's own
// menu, instead of a row of buttons that won't fit.

export function BulkRunActions({
  taskId,
  completedCount,
  failedCount,
  can,
  testRestore,
}: {
  taskId: string;
  completedCount: number;
  failedCount: number;
  can: { trigger: boolean; deleteRuns: boolean };
  /** Test restores are set up on this server for the task's engine. */
  testRestore: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { confirm, alertUser } = useModal();

  const testAllMessage = `Test-restore all ${completedCount} backup${completedCount === 1 ? "" : "s"}? Each one is restored into a temporary database on the test-restore server, one after another, so this can take a while and puts load on that server.`;
  const clearMessage = "Remove all failed backup records for this task? This cannot be undone.";

  const verifyAll = () => verifyAllBackupRuns(taskId);
  const testRestoreAll = () => testRestoreAllBackupRuns(taskId);
  const removeFailed = async () => {
    const count = await clearFailedBackupRuns(taskId);
    alertUser(count === 0 ? "No failed backups to remove." : `Removed ${count} failed backup${count === 1 ? "" : "s"}.`);
  };

  const showVerify = can.trigger && completedCount > 0;
  const showTestRestore = showVerify && testRestore;
  const showRemoveFailed = can.deleteRuns && failedCount > 0;
  if (!showVerify && !showRemoveFailed) return null;

  // Phone drawer. Confirmations are asked before starting the transition
  // (see RunActions.tsx for why).
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        alertUser(err instanceof Error ? err.message : String(err));
      }
    });
  const actions: MenuAction[] = [];
  if (showVerify) {
    actions.push({ key: "verify-all", label: "Verify all", icon: LuShieldCheck, description: "Check every backup is intact and reads back completely", onSelect: () => run(verifyAll) });
  }
  if (showTestRestore) {
    actions.push({
      key: "test-restore-all",
      label: "Test-restore all",
      icon: LuDatabaseZap,
      description: "Restore each backup into a temporary database, one at a time",
      onSelect: async () => {
        if (await confirm({ title: "Test-restore all backups?", message: testAllMessage, confirmLabel: "Test-restore all" })) run(testRestoreAll);
      },
    });
  }
  if (showRemoveFailed) {
    actions.push({
      key: "remove-failed",
      label: "Remove failed backups",
      icon: LuTrash2,
      description: `Clear ${failedCount} failed backup record${failedCount === 1 ? "" : "s"}`,
      danger: true,
      onSelect: async () => {
        if (await confirm({ message: clearMessage, confirmLabel: "Remove", danger: true })) run(removeFailed);
      },
    });
  }

  return (
    <>
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {showVerify && (
          <StandardActionButton
            variant="outline"
            compact
            icon={LuShieldCheck}
            title="Verify all"
            pendingTitle="Queuing…"
            tooltip="Check every backup is intact and reads back completely"
            action={verifyAll}
          />
        )}
        {showTestRestore && (
          <StandardActionButton
            variant="outline"
            compact
            icon={LuDatabaseZap}
            title="Test-restore all"
            pendingTitle="Queuing…"
            tooltip="Restore each backup into a temporary database, one at a time"
            confirmMessage={testAllMessage}
            action={testRestoreAll}
          />
        )}
        {showRemoveFailed && (
          <StandardActionButton
            variant="outline"
            compact
            icon={LuTrash2}
            title="Remove failed"
            pendingTitle="Removing…"
            tooltip={`Clear ${failedCount} failed backup record${failedCount === 1 ? "" : "s"}`}
            confirmMessage={clearMessage}
            action={removeFailed}
          />
        )}
      </div>
      <div className="sm:hidden">
        <ActionMenu
          actions={actions}
          variant="sheet"
          label="Actions for all backups"
          title="All backups"
          summary={`${completedCount} backup${completedCount === 1 ? "" : "s"}${failedCount ? ` · ${failedCount} failed` : ""}`}
          busy={isPending}
        />
      </div>
    </>
  );
}
