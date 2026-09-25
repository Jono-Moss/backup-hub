import { notFound } from "next/navigation";
import { getTask, listRuns, updateTaskSettings, listTaskRecipients } from "../actions";
import { RunNowButton } from "@/components/ui/RunNowButton";
import { ToggleEnabledButton } from "@/components/ui/ToggleEnabledButton";
import { DeleteTaskButton } from "@/components/ui/DeleteTaskButton";
import { DeleteRunButton, RestoreRunButton, ClearFailedRunsButton } from "@/components/ui/RunActions";
import { AddTaskRecipientForm } from "@/components/ui/AddTaskRecipientForm";
import { RemoveTaskRecipientButton } from "@/components/ui/RemoveTaskRecipientButton";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { CronSchedulePicker } from "@/components/ui/CronSchedulePicker";

export const dynamic = "force-dynamic";

const engineLabel: Record<string, string> = { mysql: "MySQL", postgres: "Postgres" };

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

const statusStyle: Record<string, string> = {
  completed: "text-primary",
  failed: "text-danger",
  running: "text-warn",
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();
  const [runs, recipients] = await Promise.all([listRuns(id), listTaskRecipients(id)]);
  const updateSettings = updateTaskSettings.bind(null, task.id);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">{task.name}</h1>
          <p className="text-sm text-muted mt-1">
            {engineLabel[task.engine]} · {task.enabled ? "Schedule active" : "Schedule disabled"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ToggleEnabledButton taskId={task.id} enabled={task.enabled} />
          <RunNowButton taskId={task.id} />
        </div>
      </div>

      <StandardSection>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Backup history</h2>
          {runs.some((r) => r.status === "failed") && <ClearFailedRunsButton taskId={task.id} />}
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No backups yet — run one now, or wait for the next scheduled run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 font-medium">File</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Size</th>
                  <th className="py-2 font-medium">Trigger</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 font-mono text-xs text-ink">{run.filename ?? "—"}</td>
                    <td className="py-2.5 text-muted"><LocalTime value={run.startedAt} /></td>
                    <td className="py-2.5 text-muted">{formatBytes(run.sizeBytes)}</td>
                    <td className="py-2.5 text-muted capitalize">{run.triggeredBy}</td>
                    <td className={`py-2.5 font-medium capitalize ${statusStyle[run.status]}`}>
                      {run.status}
                      {run.status === "failed" && run.errorMessage && (
                        <span className="block text-xs text-muted font-normal normal-case mt-0.5 max-w-xs truncate" title={run.errorMessage}>
                          {run.errorMessage}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right space-x-3 whitespace-nowrap">
                      {run.status === "completed" && (
                        <>
                          <StandardLinkButton
                            href={`/tasks/${task.id}/runs/${run.id}/download`}
                            title="Download"
                            compact
                          />
                          <RestoreRunButton taskId={task.id} runId={run.id} encrypted={run.encrypted} />
                        </>
                      )}
                      <DeleteRunButton taskId={task.id} runId={run.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StandardSection>

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Notifications</h2>
        <p className="text-sm text-muted mb-4">
          Email recipients for this task's backup outcomes. Requires SMTP to be configured (see .env).
        </p>

        {recipients.length > 0 && (
          <div className="divide-y divide-line mb-4">
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm text-ink">{r.email}</p>
                  <p className="text-xs text-muted">
                    {[r.notifyOnSuccess && "on success", r.notifyOnFailure && "on failure"]
                      .filter(Boolean)
                      .join(", ") || "no events selected"}
                  </p>
                </div>
                <RemoveTaskRecipientButton taskId={task.id} recipientId={r.id} />
              </div>
            ))}
          </div>
        )}

        <AddTaskRecipientForm taskId={task.id} />
      </StandardSection>

      <StandardSection WidthVariant="half">
        <h2 className="text-sm font-semibold text-ink mb-4">Settings</h2>
        <form action={updateSettings} className="space-y-6">
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="name">
              Task name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={task.name}
              required
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <CronSchedulePicker
                name="cronExpression"
                defaultValue={task.cronExpression}
              />
            </div>
            <div>
              <label className="block text-sm text-ink mb-1" htmlFor="retentionCount">
                Backups to keep
              </label>
              <input
                id="retentionCount"
                name="retentionCount"
                type="number"
                min={1}
                defaultValue={task.retentionCount}
                className="w-full border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="encryptionEnabled"
              name="encryptionEnabled"
              type="checkbox"
              defaultChecked={task.encryptionEnabled}
            />
            <label htmlFor="encryptionEnabled" className="text-sm text-ink">
              Encrypt backup files
            </label>
          </div>
          <div>
            <label className="block text-sm text-ink mb-1" htmlFor="backupPassword">
              Encryption password
            </label>
            <input
              id="backupPassword"
              name="backupPassword"
              type="password"
              placeholder={task.encryptedBackupPassword ? "Leave blank to keep current password" : "Set a password"}
              className="w-full border border-line px-3 py-2 text-sm"
            />
          </div>

          <p className="text-xs text-muted">
            Database connection details aren&apos;t editable here yet — delete and recreate the task to change them,
            or use <code className="font-mono">PATCH /api/v1/tasks/:id</code>.
          </p>

          <div className="flex items-center justify-between pt-2">
            <StandardSubmitButton title="Save settings" />
            <DeleteTaskButton taskId={task.id} />
          </div>
        </form>
      </StandardSection>
    </div>
  );
}