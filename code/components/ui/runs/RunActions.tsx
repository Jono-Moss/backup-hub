"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { LuDatabaseZap, LuDownload, LuHistory, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import {
  deleteBackupRun,
  restoreBackupRun,
  verifyBackupRun,
  testRestoreBackupRun,
} from "@/app/tasks/actions";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { ActionMenu, type MenuAction } from "@/components/ui/common/ActionMenu";
import { useModal } from "@/components/ui/modal/ModalProvider";
import { useToast } from "@/components/ui/common/ToastProvider";
import { useActionFeedback, type FeedbackOptions } from "@/components/ui/common/useActionFeedback";


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
  const { confirm } = useModal();
  const feedback = useActionFeedback();
  const t = useTranslations("runs");
  const tCommon = useTranslations("common");
  const completed = run.status === "completed";
  const downloadHref = `/tasks/${taskId}/runs/${run.id}/download`;

  const runAction = (fn: () => Promise<unknown>, success?: FeedbackOptions["success"]) =>
    startTransition(async () => {
      await feedback(fn, { success });
    });

  // Confirmations are asked *before* starting the transition: React holds
  // back state updates made inside a transition until it finishes, so a
  // dialog opened from inside one could never appear.
  const restore = async () => {
    // Encrypted backups need their password, so they get the dialog; plain
    // ones just need a confirmation.
    if (run.encrypted) return setRestoreOpen(true);
    const ok = await confirm({ title: t("restoreTitle"), message: t("restoreWarning"), confirmLabel: t("restore"), danger: true });
    if (!ok) return;
    runAction(() => restoreBackupRun(taskId, run.id), t("restoreDone"));
  };

  const actions: MenuAction[] = [];
  if (completed && can.download && variant === "mobile") {
    actions.push({ key: "download", label: t("download"), icon: LuDownload, href: downloadHref });
  }
  if (completed && can.restore) {
    actions.push({ key: "restore", label: t("restoreMenu"), icon: LuHistory, description: t("restoreDescription"), onSelect: restore });
  }
  if (completed && can.trigger) {
    actions.push({
      key: "verify",
      label: t("verifyFile"),
      icon: LuShieldCheck,
      description: t("verifyDescription"),
      disabled: checking,
      onSelect: () => runAction(() => verifyBackupRun(taskId, run.id), t("checkStarted")),
    });
    if (testRestore) {
      actions.push({
        key: "test-restore",
        label: t("testRestore"),
        icon: LuDatabaseZap,
        description: t("testRestoreDescription"),
        disabled: checking,
        onSelect: () => runAction(() => testRestoreBackupRun(taskId, run.id), t("testRestoreStarted")),
      });
    }
  }
  if (can.deleteRuns) {
    actions.push({
      key: "delete",
      label: t("deleteMenu"),
      icon: LuTrash2,
      description: t("deleteDescription"),
      danger: true,
      onSelect: async () => {
        const ok = await confirm({ title: t("deleteTitle"), message: t("deleteMessage"), confirmLabel: tCommon("delete"), danger: true });
        if (ok) runAction(() => deleteBackupRun(taskId, run.id), t("deleted"));
      },
    });
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
        {variant === "desktop" && completed && can.download && (
          <StandardLinkButton href={downloadHref} title={t("download")} compact />
        )}
        <ActionMenu
          actions={actions}
          variant={variant === "desktop" ? "dropdown" : "sheet"}
          label={t("actionsLabel")}
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
  const t = useTranslations("runs");
  const tCommon = useTranslations("common");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const submit = () => {
    if (!password) return setError(t("passwordNeeded"));
    setError(null);
    startTransition(async () => {
      const result = await restoreBackupRun(taskId, runId, password);
      if (!result.ok) return setError(result.message);
      onClose();
      toast.success(t("restoreDone"));
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-md border border-line bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-ink mb-1">{t("restoreTitle")}</h2>
        <p className="text-sm text-muted mb-4">{t("restoreWarning")}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block text-sm text-ink mb-1" htmlFor="restore-password">
            {t("encryptionPassword")}
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
            placeholder={t("passwordPlaceholder")}
            className="w-full border border-line px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted mb-4">
            {t("passwordHint")}
          </p>

          {error && <p className="text-sm text-danger mb-4">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-line text-ink text-sm font-medium px-4 py-2 hover:border-primary disabled:opacity-40"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary text-white text-sm font-medium px-4 py-2 border-b-primary-dark border-b-2 hover:border-b-transparent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? t("restoring") : t("restore")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
