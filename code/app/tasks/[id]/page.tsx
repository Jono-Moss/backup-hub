import { ActionForm } from "@/components/ui/common/ActionForm";
import { notFound } from "next/navigation";
import { testRestoreAvailable } from "@/lib/backup/verify";
import { VerifyBadge } from "@/components/ui/runs/VerifyBadge";
import { RefreshWhileChecking } from "@/components/ui/runs/VerifyActions";
import { BulkRunActions } from "@/components/ui/runs/BulkRunActions";
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
import { RunNowButton } from "@/components/ui/tasks/RunNowButton";
import { ToggleEnabledButton } from "@/components/ui/tasks/ToggleEnabledButton";
import { DeleteTaskButton } from "@/components/ui/tasks/DeleteTaskButton";
import { RunActions } from "@/components/ui/runs/RunActions";
import { AddTaskRecipientForm } from "@/components/ui/notifications/AddTaskRecipientForm";
import { RemoveTaskRecipientButton } from "@/components/ui/notifications/RemoveTaskRecipientButton";
import { AddTaskDestinationForm } from "@/components/ui/locations/AddTaskDestinationForm";
import { AttachSavedDestinationForm } from "@/components/ui/locations/AttachSavedDestinationForm";
import { AttachSavedChannelForm } from "@/components/ui/notifications/AttachSavedChannelForm";
import {
  ToggleTaskDestinationButton,
  RemoveTaskDestinationButton,
  TestTaskDestinationButton,
} from "@/components/ui/locations/TaskDestinationActions";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { LocalTime } from "@/components/ui/common/LocalTime";
import { CronSchedulePicker } from "@/components/ui/tasks/CronSchedulePicker";
import { ShareTaskForm } from "@/components/ui/tasks/ShareTaskForm";
import { RevokeTaskShareButton } from "@/components/ui/tasks/RevokeTaskShareButton";
import { scopeLabel } from "@/components/ui/api-keys/scopeOptions";
import { canDo } from "@/lib/auth/task-access";
import { LuBell, LuCloudUpload, LuHistory, LuSettings, LuUsers } from "react-icons/lu";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StandardEntryCard, StandardEntryList } from "@/components/ui/standard/StandardEntryCard";
import { AddableSection, type AddTab } from "@/components/ui/common/AddableSection";
import { TaskSectionNav, type SectionNavItem } from "@/components/ui/tasks/TaskSectionNav";
import { RunsPagination, paginateRuns, parseRunsPage } from "@/components/ui/runs/RunsPagination";

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

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ runsPage?: string | string[] }>;
}) {
  const { id } = await params;
  const { runsPage } = await searchParams;
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
  const canTestRestore = testRestoreAvailable(task.engine);
  const checking = runs.some(isChecking);
  const completedCount = runs.filter((r) => r.status === "completed").length;
  const page = parseRunsPage(runsPage, runs.length);
  const visibleRuns = paginateRuns(runs, page);
  const uploads = await listRunUploads(id, visibleRuns.map((r) => r.id));
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

  const navItems: SectionNavItem[] = [
    { id: "backups", label: "Backups", count: runs.length },
    { id: "notifications", label: "Notifications", count: recipients.length },
    ...(can.manage ? [{ id: "locations", label: "Save locations", count: destinations.length }] : []),
    ...(task.access.isOwner ? [{ id: "sharing", label: "Sharing", count: shares.length }] : []),
    ...(can.manage ? [{ id: "settings", label: "Settings" }] : []),
  ];

  // "Use saved" is only offered when there's something to pick; otherwise
  // the panel goes straight to the create form.
  const notificationTabs: AddTab[] = [
    ...(task.access.isOwner && attachableChannels.length > 0
      ? [{ key: "saved", label: "Use a saved channel", content: <AttachSavedChannelForm taskId={task.id} saved={attachableChannels} /> }]
      : []),
    { key: "new", label: "Create new", content: <AddTaskRecipientForm taskId={task.id} canSaveToAccount={task.access.isOwner} /> },
  ];
  const locationTabs: AddTab[] = [
    ...(task.access.isOwner && attachable.length > 0
      ? [
          {
            key: "saved",
            label: "Use a saved location",
            content: (
              <AttachSavedDestinationForm
                taskId={task.id}
                taskName={task.name}
                saved={attachable}
                providerLabels={providerLabels}
              />
            ),
          },
        ]
      : []),
    {
      key: "new",
      label: "Create new",
      content: (
        <AddTaskDestinationForm taskId={task.id} providers={destinationProviders} canSaveToAccount={task.access.isOwner} />
      ),
    },
  ];

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

      <TaskSectionNav items={navItems} />

      <StandardSection id="backups">
        <RefreshWhileChecking active={checking} />
        <StandardSectionHeader
          title="Backup history"
          icon={<LuHistory />}
          count={runs.length}
          description="Every backup this task has made, newest first."
          action={
            <BulkRunActions
              taskId={task.id}
              completedCount={completedCount}
              failedCount={runs.filter((r) => r.status === "failed").length}
              can={can}
              testRestore={canTestRestore}
            />
          }
        />
        {runs.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No backups yet — run one now, or wait for the next scheduled run.
          </div>
        ) : (
          <>
          {/* Phones and tablets: one card per run. The table needs ~900px. */}
          <div className="lg:hidden divide-y divide-line">
            {visibleRuns.map((run) => (
              <div key={run.id} className="py-3 space-y-1.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`font-medium capitalize ${statusStyle[run.status]}`}>{run.status}</span>
                    <p className="text-muted">
                      <LocalTime value={run.startedAt} /> · {formatBytes(run.sizeBytes)} ·{" "}
                      <span className="capitalize">{run.triggeredBy}</span>
                    </p>
                  </div>
                  <RunActions
                    taskId={task.id}
                    run={run}
                    can={can}
                    testRestore={canTestRestore}
                    checking={isChecking(run)}
                    variant="mobile"
                    title={run.filename ?? "Failed backup"}
                    summary={
                      <>
                        <LocalTime value={run.startedAt} /> · {formatBytes(run.sizeBytes)}
                        {run.status === "completed" && (
                          <span className="block mt-1">
                            <VerifyBadge {...verifyProps(run)} />
                          </span>
                        )}
                      </>
                    }
                  />
                </div>
                <p className="font-mono text-xs text-ink break-all">{run.filename ?? "—"}</p>
                {run.status === "failed" && run.errorMessage && (
                  <p className="text-xs text-muted break-words">{run.errorMessage}</p>
                )}
                <div className="text-xs">
                  <RunUploads uploads={uploadsByRun.get(run.id) ?? []} destinationById={destinationById} />
                </div>
                {run.status === "completed" && <VerifyBadge {...verifyProps(run)} />}
              </div>
            ))}
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">File</th>
                  <th className="py-2 pr-4 font-medium">Started</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((run) => (
                  <tr key={run.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-4 min-w-56 font-mono text-xs text-ink">
                      <span className="break-all">{run.filename ?? "—"}</span>
                      <RunUploads uploads={uploadsByRun.get(run.id) ?? []} destinationById={destinationById} />
                    </td>
                    {/* Size and trigger sit under the date, so the filename gets the width. */}
                    <td className="py-2.5 pr-4 text-muted whitespace-nowrap">
                      <LocalTime value={run.startedAt} />
                      <span className="block text-xs mt-0.5">
                        {formatBytes(run.sizeBytes)} · <span className="capitalize">{run.triggeredBy}</span>
                      </span>
                    </td>
                    <td className={`py-2.5 pr-4 font-medium capitalize ${statusStyle[run.status]}`}>
                      {run.status}
                      {run.status === "failed" && run.errorMessage && (
                        <span className="block text-xs text-muted font-normal normal-case mt-0.5 max-w-48 truncate" title={run.errorMessage}>
                          {run.errorMessage}
                        </span>
                      )}
                      {run.status === "completed" && (
                        <span className="block mt-0.5 max-w-56">
                          <VerifyBadge {...verifyProps(run)} />
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <RunActions
                        taskId={task.id}
                        run={run}
                        can={can}
                        testRestore={canTestRestore}
                        checking={isChecking(run)}
                        variant="desktop"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RunsPagination page={page} total={runs.length} />
          </>
        )}
      </StandardSection>

      <AddableSection
        id="notifications"
        title="Notifications"
        icon={<LuBell />}
        count={recipients.length}
        description="Where this task's backup outcomes are sent — email (requires SMTP, see .env), ntfy, Telegram or Discord."
        canAdd={can.manage}
        addLabel="Add notification"
        panelTitle="New notification"
        tabs={notificationTabs}
        emptyMessage="No notifications set — nobody is told when this task's backups succeed or fail."
      >
        <StandardEntryList>
          {recipients.map((r) => (
            <StandardEntryCard
              key={r.id}
              title={
                r.label ?? (
                  <>
                    {r.channelLabel}{" "}
                    <span className="font-normal text-muted">(details visible to the task owner only)</span>
                  </>
                )
              }
              meta={r.target && r.target !== r.label ? r.target : undefined}
              badges={
                <>
                  {r.notifyOnSuccess && <StandardBadge tone="primary">On success</StandardBadge>}
                  {r.notifyOnFailure && <StandardBadge tone="danger">On failure</StandardBadge>}
                  {!r.notifyOnSuccess && !r.notifyOnFailure && <StandardBadge tone="warn">No events selected</StandardBadge>}
                  <StandardBadge>
                    {r.taskOnly ? "Task-only" : task.access.isOwner ? "From your saved channels" : "Saved channel"}
                  </StandardBadge>
                </>
              }
              actions={
                can.manage && <RemoveTaskRecipientButton taskId={task.id} recipientId={r.id} taskOnly={r.taskOnly} />
              }
            />
          ))}
        </StandardEntryList>
      </AddableSection>

      {can.manage && (
        <AddableSection
          id="locations"
          title="Remote save locations"
          icon={<LuCloudUpload />}
          count={destinations.length}
          description="Every completed backup is always kept locally. Save locations also copy each file off-site — each is tried independently, so one being down never affects the others or the local copy."
          canAdd={can.manage && destinationProviders.length > 0}
          addLabel="Add location"
          panelTitle="New save location"
          tabs={locationTabs}
          emptyMessage="No remote save locations — backups are only kept on this server."
        >
          <StandardEntryList>
            {destinations.map((d) => (
              <StandardEntryCard
                key={d.linkId}
                title={d.label}
                meta={
                  d.subfolder && (
                    <>
                      Subfolder <span className="font-mono">{d.subfolder}</span>
                    </>
                  )
                }
                badges={
                  <>
                    <StandardBadge tone="primary">{providerLabels[d.type] ?? d.type}</StandardBadge>
                    {!d.enabled && <StandardBadge tone="warn">Disabled</StandardBadge>}
                    <StandardBadge>
                      {d.taskOnly ? "Task-only" : task.access.isOwner ? "From your saved locations" : "Saved location"}
                    </StandardBadge>
                  </>
                }
                actions={
                  <>
                    <TestTaskDestinationButton taskId={task.id} linkId={d.linkId} />
                    <ToggleTaskDestinationButton taskId={task.id} linkId={d.linkId} enabled={d.enabled} />
                    <RemoveTaskDestinationButton taskId={task.id} linkId={d.linkId} taskOnly={d.taskOnly} />
                  </>
                }
              />
            ))}
          </StandardEntryList>
        </AddableSection>
      )}

      {task.access.isOwner && (
        <AddableSection
          id="sharing"
          title="Sharing"
          icon={<LuUsers />}
          count={shares.length}
          description="You own this task. Only you and the people below can see it — not even admins can."
          canAdd
          addLabel="Share task"
          panelTitle="Share with someone"
          tabs={[{ key: "share", label: "Share", content: <ShareTaskForm taskId={task.id} /> }]}
          emptyMessage="Not shared with anyone."
        >
          <StandardEntryList>
            {shares.map((share) => (
              <StandardEntryCard
                key={share.id}
                title={
                  <>
                    {share.name} <span className="font-normal text-muted">({share.email})</span>
                  </>
                }
                badges={share.scopes.map((s) => (
                  <StandardBadge key={s}>{scopeLabel(s)}</StandardBadge>
                ))}
                actions={<RevokeTaskShareButton taskId={task.id} shareId={share.id} />}
              />
            ))}
          </StandardEntryList>
        </AddableSection>
      )}

      {can.manage && (
      <StandardSection id="settings">
        <StandardSectionHeader
          title="Settings"
          icon={<LuSettings />}
          description="Schedule, retention and encryption for this task."
        />
        <ActionForm action={updateSettings} success="Settings saved" resetOnSuccess className="space-y-6">
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

          {canTestRestore && (
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="testRestoreAfterBackup"
                  name="testRestoreAfterBackup"
                  type="checkbox"
                  defaultChecked={task.testRestoreAfterBackup}
                />
                <label htmlFor="testRestoreAfterBackup" className="text-sm text-ink">
                  Test-restore each new backup
                </label>
              </div>
              <p className="text-xs text-muted mt-1">
                Every backup is already checked to read back completely. This also restores it into a temporary
                database on the server&apos;s test-restore server, checks it, then deletes it — slower, and alerts the
                task&apos;s failure recipients if it fails.
              </p>
            </div>
          )}

          <p className="text-xs text-muted">
            Database connection details aren&apos;t editable here yet — delete and recreate the task to change them,
            or use <code className="font-mono">PATCH /api/v1/tasks/:id</code>.
          </p>

          <div className="flex items-center justify-between pt-2">
            <StandardSubmitButton title="Save settings" />
            <DeleteTaskButton taskId={task.id} />
          </div>
        </ActionForm>
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

function verifyProps(run: Run) {
  return { status: run.verifyStatus, level: run.verifyLevel, message: run.verifyMessage, verifiedAt: run.verifiedAt };
}

function isChecking(run: Run) {
  return run.verifyStatus === "queued" || run.verifyStatus === "running";
}
