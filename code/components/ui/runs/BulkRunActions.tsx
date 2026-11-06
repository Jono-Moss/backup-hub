"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { LuDatabaseZap, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import { clearFailedBackupRuns, testRestoreAllBackupRuns, verifyAllBackupRuns } from "@/app/tasks/actions";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { ActionMenu, type MenuAction } from "@/components/ui/common/ActionMenu";
import { useModal } from "@/components/ui/modal/ModalProvider";
import { useActionFeedback } from "@/components/ui/common/useActionFeedback";

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
  const { confirm } = useModal();
  const feedback = useActionFeedback();
  const t = useTranslations("runs");
  const tCommon = useTranslations("common");

  const testAllMessage = t("testAllConfirm", { count: completedCount });
  const clearMessage = t("clearConfirm");

  const verifyAll = () => verifyAllBackupRuns(taskId);
  const testRestoreAll = () => testRestoreAllBackupRuns(taskId);
  const removeFailed = () => clearFailedBackupRuns(taskId);
  const verifyAllMessage = t("verifyAllStarted");
  const testRestoreAllMessage = t("testAllStarted");
  const removedMessage = (count: unknown) =>
    count === 0 ? t("noFailed") : t("removedFailed", { count: Number(count) });

  const showVerify = can.trigger && completedCount > 0;
  const showTestRestore = showVerify && testRestore;
  const showRemoveFailed = can.deleteRuns && failedCount > 0;
  if (!showVerify && !showRemoveFailed) return null;

  // Phone drawer. Confirmations are asked before starting the transition
  // (see RunActions.tsx for why).
  const run = (fn: () => Promise<unknown>, success: string | ((result: unknown) => string)) =>
    startTransition(async () => {
      await feedback(fn, { success });
    });
  const actions: MenuAction[] = [];
  if (showVerify) {
    actions.push({ key: "verify-all", label: t("verifyAll"), icon: LuShieldCheck, description: t("verifyAllDescription"), onSelect: () => run(verifyAll, verifyAllMessage) });
  }
  if (showTestRestore) {
    actions.push({
      key: "test-restore-all",
      label: t("testAll"),
      icon: LuDatabaseZap,
      description: t("testAllDescription"),
      onSelect: async () => {
        if (await confirm({ title: t("testAllTitle"), message: testAllMessage, confirmLabel: t("testAll") })) run(testRestoreAll, testRestoreAllMessage);
      },
    });
  }
  if (showRemoveFailed) {
    actions.push({
      key: "remove-failed",
      label: t("removeFailedMenu"),
      icon: LuTrash2,
      description: t("clearDescription", { count: failedCount }),
      danger: true,
      onSelect: async () => {
        if (await confirm({ message: clearMessage, confirmLabel: tCommon("remove"), danger: true })) run(removeFailed, removedMessage);
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
            title={t("verifyAll")}
            pendingTitle={t("queuing")}
            tooltip={t("verifyAllDescription")}
            action={verifyAll}
            successMessage={verifyAllMessage}
          />
        )}
        {showTestRestore && (
          <StandardActionButton
            variant="outline"
            compact
            icon={LuDatabaseZap}
            title={t("testAll")}
            pendingTitle={t("queuing")}
            tooltip={t("testAllDescription")}
            confirmMessage={testAllMessage}
            action={testRestoreAll}
            successMessage={testRestoreAllMessage}
          />
        )}
        {showRemoveFailed && (
          <StandardActionButton
            variant="outline"
            compact
            icon={LuTrash2}
            title={t("removeFailed")}
            pendingTitle={t("removing")}
            tooltip={t("clearDescription", { count: failedCount })}
            confirmMessage={clearMessage}
            action={removeFailed}
            successMessage={removedMessage}
          />
        )}
      </div>
      <div className="sm:hidden">
        <ActionMenu
          actions={actions}
          variant="sheet"
          label={t("allActionsLabel")}
          title={t("allBackups")}
          summary={`${t("summaryCount", { count: completedCount })}${failedCount ? ` · ${t("summaryFailed", { count: failedCount })}` : ""}`}
          busy={isPending}
        />
      </div>
    </>
  );
}
