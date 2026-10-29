import { notFound } from "next/navigation";
import {
  getTask,
  listRuns,
  listRunUploads,
  updateTaskSettings,
  listTaskRecipients,
  listTaskShares,
  listTaskDestinations,
  listDestinationProviders,
  listAttachableDestinations,
  listAttachableChannels,
} from "../actions";
import { RunNowButton } from "@/components/ui/RunNowButton";
import { ToggleEnabledButton } from "@/components/ui/ToggleEnabledButton";
import { DeleteTaskButton } from "@/components/ui/DeleteTaskButton";
import { DeleteRunButton, RestoreRunButton, ClearFailedRunsButton } from "@/components/ui/RunActions";
import { AddTaskRecipientForm } from "@/components/ui/AddTaskRecipientForm";
import { RemoveTaskRecipientButton } from "@/components/ui/RemoveTaskRecipientButton";
import { AddTaskDestinationForm } from "@/components/ui/AddTaskDestinationForm";
import { AttachSavedDestinationForm } from "@/components/ui/AttachSavedDestinationForm";
import { AttachSavedChannelForm } from "@/components/ui/AttachSavedChannelForm";
import {
  ToggleTaskDestinationButton,
  RemoveTaskDestinationButton,
  TestTaskDestinationButton,
} from "@/components/ui/TaskDestinationActions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { CronSchedulePicker } from "@/components/ui/CronSchedulePicker";
import { ShareTaskForm } from "@/components/ui/ShareTaskForm";
import { RevokeTaskShareButton } from "@/components/ui/RevokeTaskShareButton";
import { scopeLabel } from "@/components/ui/scopeOptions";
import { canDo } from "@/lib/auth/task-access";

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
  const [runs, recipients, shares, destinations, destinationProviders, attachable, attachableChannels] = await Promise.all([
    listRuns(id),
    listTaskRecipients(id),
    task.access.isOwner ? listTaskShares(id) : Promise.resolve([]),
    listTaskDestinations(id),
    listDestinationProviders(),
    task.access.isOwner ? listAttachableDestinations(id) : Promise.resolve([]),
    task.access.isOwner ? listAttachableChannels(id) : Promise.resolve([]),
  ]);
  const providerLabels = Object.fromEntries(destinationProviders.map((p) => [p.type, p.label]));
  const uploads = await listRunUploads(id, runs.map((r) => r.id));
  const uploadsByRun = new Map<string, typeof uploads>();
  for (const u of uploads) {
    uploadsByRun.set(u.runId, [...(uploadsByRun.get(u.runId) ?? []), u]);
  }
  const destinationById = new Map(destinations.map((d) => [d.destinationId, d]));
  const updateSettings = updateTaskSettings.bind(null, task.id);

  // What this user may do here. Hiding a control is only for tidiness — every
  // server action re-checks the same permission itself.
  const can = {
    manage: canDo(task.access, "tasks:write"),
    trigger: canDo(task.access, "runs:trigger"),
    download: canDo(task.access, "runs:download"),
    deleteRuns: canDo(task.access, "runs:delete"),
    restore: task.access.isOwner,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">{task.name}</h1>
          <p className="text-sm text-muted mt-1">
            {engineLabel[task.engine]} · {task.enabled ? "Schedule active" : "Schedule disabled"}
            {!task.access.isOwner && ` · shared by ${task.ownerName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can.manage && <ToggleEnabledButton taskId={task.id} enabled={task.enabled} />}
          {can.trigger && <RunNowButton taskId={task.id} />}
        </div>
      </div>

      <StandardSection>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Backup history</h2>
          {can.deleteRuns && runs.some((r) => r.status === "failed") && <ClearFailedRunsButton taskId={task.id} />}
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No backups yet — run one now, or wait for the next scheduled run.</p>
        ) : (
          <>
          {/* Phones: one card per run. */}
          <div className="sm:hidden divide-y divide-line">
            {runs.map((run) => (
              <div key={run.id} className="py-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className={`font-medium capitalize ${statusStyle[run.status]}`}>{run.status}</span>
                  <span className="text-xs text-muted capitalize">{run.triggeredBy}</span>
                </div>
                <p className="text-muted">
                  <LocalTime value={run.startedAt} /> · {formatBytes(run.sizeBytes)}
                </p>
                <p className="font-mono text-xs text-ink break-all">{run.filename ?? "—"}</p>
                {run.status === "failed" && run.errorMessage && (
                  <p className="text-xs text-muted break-words">{run.errorMessage}</p>
                )}
                <div className="text-xs">
                  <RunUploads uploads={uploadsByRun.get(run.id) ?? []} destinationById={destinationById} />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <RunButtons taskId={task.id} run={run} can={can} />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
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
                    <td className="py-2.5 font-mono text-xs text-ink">
                      {run.filename ?? "—"}
                      <RunUploads uploads={uploadsByRun.get(run.id) ?? []} destinationById={destinationById} />
                    </td>
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
                      <RunButtons taskId={task.id} run={run} can={can} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </StandardSection>

      <StandardSection>
        <h2 className="text-sm font-semibold text-ink mb-1">Notifications</h2>
        <p className="text-sm text-muted mb-4">
          Where to send this task's backup outcomes — email (requires SMTP, see .env), ntfy, Telegram or Discord.
        </p>

        {recipients.length > 0 && (
          <div className="divide-y divide-line mb-4">
            {recipients.map((r) => (
              <div key={r.id} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between py-2.5">
                <div>
                  <p className="text-sm text-ink">
                    {r.label ?? (
                      <>
                        {r.channelLabel} <span className="text-muted">(details visible to the task owner only)</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {r.target && r.target !== r.label && <>{r.target} · </>}
                    {r.taskOnly ? "task-only" : task.access.isOwner ? "from your saved channels" : "saved channel"}
                    {" · "}
                    {[r.notifyOnSuccess && "on success", r.notifyOnFailure && "on failure"]
                      .filter(Boolean)
                      .join(", ") || "no events selected"}
                  </p>
                </div>
                {can.manage && <RemoveTaskRecipientButton taskId={task.id} recipientId={r.id} taskOnly={r.taskOnly} />}
              </div>
            ))}
          </div>
        )}

        {task.access.isOwner && (
          <div className="border-t border-line pt-4 mb-6">
            <AttachSavedChannelForm taskId={task.id} saved={attachableChannels} />
          </div>
        )}

        {can.manage && (
          <div className="border-t border-line pt-4">
            <AddTaskRecipientForm taskId={task.id} canSaveToAccount={task.access.isOwner} />
          </div>
        )}
      </StandardSection>

      {can.manage && (
        <StandardSection>
          <h2 className="text-sm font-semibold text-ink mb-1">Remote Save locations</h2>
          <p className="text-sm text-muted mb-4">
            Every completed backup is always kept locally. Save locations also copy each file off-site — a task can
            have any number, and each is tried independently, so one being down never affects the others or the
            local copy.
          </p>

          {destinations.length > 0 && (
            <div className="divide-y divide-line mb-4">
              {destinations.map((d) => (
                <div key={d.linkId} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">
                      {d.label}
                      {!d.enabled && <span className="text-muted font-normal"> (disabled)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {providerLabels[d.type] ?? d.type}
                      {" · "}
                      {d.taskOnly ? "task-only" : task.access.isOwner ? "from your saved locations" : "saved location"}
                      {d.subfolder && (
                        <>
                          {" · subfolder "}
                          <span className="font-mono">{d.subfolder}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                    <TestTaskDestinationButton taskId={task.id} linkId={d.linkId} />
                    <ToggleTaskDestinationButton taskId={task.id} linkId={d.linkId} enabled={d.enabled} />
                    <RemoveTaskDestinationButton taskId={task.id} linkId={d.linkId} taskOnly={d.taskOnly} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {task.access.isOwner && (
            <div className="border-t border-line pt-4 mb-6">
              <AttachSavedDestinationForm
                taskId={task.id}
                taskName={task.name}
                saved={attachable}
                providerLabels={providerLabels}
              />
            </div>
          )}

          <div className="border-t border-line pt-2">
            <AddTaskDestinationForm
              taskId={task.id}
              providers={destinationProviders}
              canSaveToAccount={task.access.isOwner}
            />
          </div>
        </StandardSection>
      )}

      {task.access.isOwner && (
        <StandardSection>
          <h2 className="text-sm font-semibold text-ink mb-1">Sharing</h2>
          <p className="text-sm text-muted mb-4">
            You own this task. Only you and the people below can see it — not even admins can.
          </p>

          {shares.length > 0 && (
            <div className="divide-y divide-line mb-6">
              {shares.map((share) => (
                <div key={share.id} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between py-2.5">
                  <div>
                    <p className="text-sm text-ink">
                      {share.name} <span className="text-muted">({share.email})</span>
                    </p>
                    <p className="text-xs text-muted">{share.scopes.map(scopeLabel).join(", ")}</p>
                  </div>
                  <RevokeTaskShareButton taskId={task.id} shareId={share.id} />
                </div>
              ))}
            </div>
          )}

          <ShareTaskForm taskId={task.id} />
        </StandardSection>
      )}

      {can.manage && (
      <StandardSection>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      )}
    </div>
  );
}
type Upload = Awaited<ReturnType<typeof listRunUploads>>[number];
type Run = Awaited<ReturnType<typeof listRuns>>[number];

// Per-destination upload status lines under a run ("Home NAS: uploaded").
function RunUploads({ uploads, destinationById }: { uploads: Upload[]; destinationById: Map<string, { label: string }> }) {
  if (uploads.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {uploads.map((u) => {
        const dest = destinationById.get(u.destinationId);
        const style =
          u.status === "completed"
            ? "text-primary"
            : u.status === "failed"
              ? "text-danger"
              : u.status === "skipped"
                ? "text-muted"
                : "text-warn";
        const text =
          u.status === "completed"
            ? "uploaded"
            : u.status === "failed"
              ? "failed"
              : u.status === "skipped"
                ? u.errorMessage ? `skipped — ${u.errorMessage}` : "skipped"
                : "uploading…";
        return (
          <div key={u.id} className={`font-sans normal-case ${style}`} title={u.errorMessage ?? u.remotePath ?? undefined}>
            {dest?.label ?? u.destinationLabel ?? "destination"}: {text}
          </div>
        );
      })}
    </div>
  );
}

function RunButtons({
  taskId,
  run,
  can,
}: {
  taskId: string;
  run: Run;
  can: { download: boolean; restore: boolean; deleteRuns: boolean };
}) {
  return (
    <>
      {run.status === "completed" && (
        <>
          {can.download && <StandardLinkButton href={`/tasks/${taskId}/runs/${run.id}/download`} title="Download" compact />}
          {can.restore && <RestoreRunButton taskId={taskId} runId={run.id} encrypted={run.encrypted} />}
        </>
      )}
      {can.deleteRuns && <DeleteRunButton taskId={taskId} runId={run.id} />}
    </>
  );
}
