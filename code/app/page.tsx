import { ENGINE_LABELS } from "@/lib/backup/engines/labels";
import Link from "next/link";
import {
  LuCircleCheck,
  LuCircleX,
  LuCloudOff,
  LuKeyRound,
  LuLoaderCircle,
  LuShieldAlert,
  LuTriangleAlert,
  LuActivity,
  LuDatabase,
  LuPlugZap,
  LuLogIn,
  LuShieldX,
  LuChevronDown,
} from "react-icons/lu";
import { getDashboardSummary, type AttentionItem } from "./tasks/actions";
import { getSignInSummary } from "./account/actions";
import { OUTCOME_LABEL, describeUserAgent } from "@/components/ui/auth/loginAttemptLabels";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";
import { StandardBadge } from "@/components/ui/standard/StandardBadge";
import { StatTile } from "@/components/ui/dashboard/StatTile";
import { RunStrip } from "@/components/ui/dashboard/RunStrip";
import { timeAgo } from "@/components/ui/dashboard/timeAgo";
import { describeCron } from "@/lib/cron/cronUtils";

export const dynamic = "force-dynamic";

const engineLabel: Record<string, string> = ENGINE_LABELS;

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

const attentionIcon: Record<AttentionItem["kind"], React.ReactNode> = {
  auth: <LuKeyRound />,
  connection: <LuPlugZap />,
  other: <LuCircleX />,
  upload: <LuCloudOff />,
  verify: <LuShieldAlert />,
};

const attentionBadge: Record<AttentionItem["kind"], { text: string; tone: "danger" | "warn" }> = {
  auth: { text: "Credentials", tone: "danger" },
  connection: { text: "Can't connect", tone: "danger" },
  other: { text: "Failed", tone: "danger" },
  upload: { text: "Off-site copy", tone: "warn" },
  verify: { text: "Check failed", tone: "warn" },
};

function RunStatus({ status }: { status: string }) {
  if (status === "completed")
    return (
      <span className="inline-flex items-center gap-1 text-primary-dark">
        <LuCircleCheck size={14} aria-hidden="true" /> Succeeded
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-danger">
        <LuCircleX size={14} aria-hidden="true" /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-warn">
      <LuLoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Running
    </span>
  );
}

export default async function DashboardPage() {
  const [{ tasks, stats, attention, recent, days }, signIn] = await Promise.all([getDashboardSummary(), getSignInSummary()]);

  // Phones get a compact layout so the task list isn't pushed off the first
  // screen: one slim row of counts, a "needs attention" banner only when
  // something's wrong, then the tasks, with the activity sections collapsed
  // underneath. Wider screens show the full overview above the tasks.
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            How your backups have been doing, and the tasks you created or that were shared with you.
          </p>
        </div>
        <div className="shrink-0">
          <StandardLinkButton href="/tasks/new" title="New task" variant="standard" />
        </div>
      </div>

      {signIn.mine.secondFactorFailures > 0 && (
        <Link
          href="/account#sign-ins"
          className="flex items-start gap-3 rounded-md border border-danger bg-danger-light px-4 py-3 text-sm text-ink hover:underline"
        >
          <LuShieldX size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <span>
            <span className="font-semibold">
              Someone entered your correct password but the wrong 2FA code {signIn.mine.secondFactorFailures} time
              {signIn.mine.secondFactorFailures === 1 ? "" : "s"} in the last {signIn.days} days.
            </span>{" "}
            If that wasn&apos;t you, change your password now.
          </span>
        </Link>
      )}

      {tasks.length > 0 && (
        <>
          {/* Phones: counts in one row */}
          <div className="sm:hidden">
            <div className="grid grid-cols-4 divide-x divide-line rounded-md border border-line bg-white">
              <CompactStat icon={<LuCircleCheck />} value={stats.completed} label="Succeeded" tone={stats.completed > 0 ? "good" : "neutral"} />
              <CompactStat icon={<LuCircleX />} value={stats.failed} label="Failed" tone={stats.failed > 0 ? "bad" : "neutral"} />
              <CompactStat icon={<LuCloudOff />} value={stats.uploadFailed} label="Copy failed" tone={stats.uploadFailed > 0 ? "warn" : "neutral"} />
              <CompactStat icon={<LuLogIn />} value={signIn.mine.failedCount} label="Bad sign-ins" tone={signIn.mine.failedCount > 0 ? "warn" : "neutral"} />
            </div>
            <p className="mt-1 text-xs text-muted">Last {days} days</p>
          </div>

          {/* Phones: only when something's wrong */}
          {attention.length > 0 && (
            <details className="sm:hidden group rounded-md border border-warn bg-warn-light">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                <LuTriangleAlert size={16} className="shrink-0 text-warn" aria-hidden="true" />
                {attention.length} {attention.length === 1 ? "problem needs" : "problems need"} attention
                <LuChevronDown size={16} aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-warn/40 bg-white p-3">
                <AttentionList attention={attention} />
              </div>
            </details>
          )}

          {/* Wider screens: full overview */}
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Successful backups"
              value={stats.completed}
              icon={<LuCircleCheck />}
              tone={stats.completed > 0 ? "good" : "neutral"}
              hint={`Last ${days} days`}
            />
            <StatTile
              label="Failed backups"
              value={stats.failed}
              icon={<LuCircleX />}
              tone={stats.failed > 0 ? "bad" : "neutral"}
              hint={`Last ${days} days`}
            />
            <StatTile
              label="Off-site copy failures"
              value={stats.uploadFailed}
              icon={<LuCloudOff />}
              tone={stats.uploadFailed > 0 ? "warn" : "neutral"}
              hint={`Last ${days} days`}
            />
            <StatTile
              label="Failed sign-ins"
              value={signIn.mine.failedCount}
              icon={<LuLogIn />}
              tone={signIn.mine.failedCount > 0 ? "warn" : "neutral"}
              hint={`To your account, last ${signIn.days} days`}
            />
          </div>

          <div className="hidden sm:grid grid-cols-1 lg:grid-cols-2 gap-8">
            <StandardSection>
              <StandardSectionHeader
                title="Needs attention"
                icon={<LuTriangleAlert />}
                count={attention.length}
                description="Problems with each task's most recent backup."
              />
              <AttentionList attention={attention} />
            </StandardSection>

            <StandardSection>
              <StandardSectionHeader
                title="Recent activity"
                icon={<LuActivity />}
                description="The latest backups across all your tasks."
              />
              <RecentList recent={recent} />
            </StandardSection>
          </div>
        </>
      )}

      <StandardSection>
        <StandardSectionHeader
          title="Backup tasks"
          icon={<LuDatabase />}
          count={tasks.length}
          description="Each task owns one database connection, its own schedule, and retention."
        />
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-line p-10 text-center">
            <p className="text-sm text-muted">No backup tasks yet.</p>
            <Link href="/tasks/new" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
              Create your first task
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks/${task.id}`}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-line bg-paper/60 px-4 py-3 hover:border-primary transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${task.enabled ? "bg-primary" : "bg-muted"}`}
                      title={task.enabled ? "Schedule active" : "Schedule disabled"}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {task.name}
                        {!task.enabled && <span className="font-normal text-muted"> (paused)</span>}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {engineLabel[task.engine]} · <span className="font-mono">{describeCron(task.cronExpression)}</span>{" "}
                        · keep {task.retentionCount}
                        {task.encryptionEnabled ? " · encrypted" : ""}
                        {!task.isOwner ? ` · shared by ${task.ownerName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end sm:shrink-0 pl-5 sm:pl-0">
                    <div className="text-xs sm:text-right">
                      {task.lastRun ? (
                        <>
                          <RunStatus status={task.lastRun.status} />
                          <span className="block text-muted">{timeAgo(task.lastRun.startedAt)}</span>
                        </>
                      ) : (
                        <span className="text-muted">Never run</span>
                      )}
                    </div>
                    <RunStrip runs={task.strip} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StandardSection>

      {/* Phones: activity sections collapsed under the tasks */}
      <div className="sm:hidden space-y-3">
        {tasks.length > 0 && (
          <MobileCollapsible title="Recent activity" icon={<LuActivity />}>
            <RecentList recent={recent} />
          </MobileCollapsible>
        )}
        <MobileCollapsible
          title="Sign-in activity"
          icon={<LuLogIn />}
          note={signIn.mine.failedCount > 0 ? `${signIn.mine.failedCount} failed` : undefined}
        >
          <SignInActivity signIn={signIn} />
          <Link href="/account#sign-ins" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Full history
          </Link>
        </MobileCollapsible>
      </div>

      <div className="hidden sm:block">
        <StandardSection>
          <StandardSectionHeader
            title="Sign-in activity"
            icon={<LuLogIn />}
            description={`Sign-ins to your account over the last ${signIn.days} days.`}
            action={
              <Link href="/account#sign-ins" className="text-sm font-medium text-primary hover:underline">
                Full history
              </Link>
            }
          />
          <SignInActivity signIn={signIn} />
        </StandardSection>
      </div>
    </div>
  );
}

type Summary = Awaited<ReturnType<typeof getDashboardSummary>>;
type SignIn = Awaited<ReturnType<typeof getSignInSummary>>;

const compactTone = {
  good: "text-primary",
  bad: "text-danger",
  warn: "text-warn",
  neutral: "text-muted",
} as const;

// One number in the phone summary row. Label under it, so colour is never alone.
function CompactStat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: keyof typeof compactTone;
}) {
  return (
    <div className="flex flex-col items-center px-1 py-2 text-center">
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className={`[&>svg]:size-3.5 ${compactTone[tone]}`}>
          {icon}
        </span>
        <span className="text-base font-semibold text-ink tabular-nums">{value}</span>
      </span>
      <span className="text-[11px] leading-tight text-muted">{label}</span>
    </div>
  );
}

// A section that starts closed on phones (native <details>, no JS needed).
function MobileCollapsible({
  title,
  icon,
  note,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-md border border-line bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-muted [&>svg]:size-4">
          {icon}
        </span>
        {title}
        {note && <StandardBadge tone="warn">{note}</StandardBadge>}
        <LuChevronDown size={16} aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

function AttentionList({ attention }: { attention: Summary["attention"] }) {
  if (attention.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-line px-4 py-6 text-sm text-muted justify-center">
        <LuCircleCheck size={16} className="text-primary" aria-hidden="true" />
        All good — every task&apos;s latest backup succeeded.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {attention.map((item, i) => (
        <li key={`${item.taskId}-${i}`}>
          <Link
            href={`/tasks/${item.taskId}#backups`}
            className="flex gap-3 rounded-md border border-line bg-paper/60 px-4 py-3 hover:border-primary transition-colors"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 [&>svg]:size-4 ${
                attentionBadge[item.kind].tone === "danger" ? "text-danger" : "text-warn"
              }`}
            >
              {attentionIcon[item.kind]}
            </span>
            <span className="min-w-0 space-y-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-ink">{item.taskName}</span>
                <StandardBadge tone={attentionBadge[item.kind].tone}>{attentionBadge[item.kind].text}</StandardBadge>
              </span>
              <span className="block text-sm text-ink">{item.title}</span>
              {item.message && (
                <span className="block text-xs text-muted line-clamp-2 break-words" title={item.message}>
                  {item.message}
                </span>
              )}
              <span className="block text-xs text-muted">{timeAgo(item.at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentList({ recent }: { recent: Summary["recent"] }) {
  if (recent.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        No backups have run yet.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {recent.map((run) => (
        <li key={run.id}>
          <Link
            href={`/tasks/${run.taskId}#backups`}
            className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
          >
            <span className="min-w-0">
              <span className="block font-medium text-ink truncate">{run.taskName}</span>
              <span className="block text-xs text-muted">
                {timeAgo(run.startedAt)} · {formatBytes(run.sizeBytes)} ·{" "}
                <span className="capitalize">{run.triggeredBy}</span>
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium">
              <RunStatus status={run.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SignInActivity({ signIn }: { signIn: SignIn }) {
  return (
    <div className={`grid grid-cols-1 gap-6 ${signIn.server ? "lg:grid-cols-2" : ""}`}>
      <div className="space-y-3">
        <p className="text-sm text-ink">
          {signIn.mine.previousSuccess ? (
            <>
              Previous sign-in {timeAgo(signIn.mine.previousSuccess.createdAt)} ·{" "}
              {describeUserAgent(signIn.mine.previousSuccess.userAgent)}
              {signIn.mine.previousSuccess.ipAddress && (
                <span className="text-muted"> · {signIn.mine.previousSuccess.ipAddress}</span>
              )}
            </>
          ) : (
            <span className="text-muted">No earlier sign-ins recorded.</span>
          )}
        </p>
        {signIn.mine.recentFailures.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-line px-4 py-4 text-sm text-muted">
            <LuCircleCheck size={16} className="text-primary" aria-hidden="true" />
            No failed sign-ins to your account.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {signIn.mine.recentFailures.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">{describeUserAgent(a.userAgent)}</span>
                  <span className="block text-xs text-muted">
                    {timeAgo(a.createdAt)}
                    {a.ipAddress && <> · {a.ipAddress}</>}
                  </span>
                </span>
                <StandardBadge tone={OUTCOME_LABEL[a.outcome].tone}>{OUTCOME_LABEL[a.outcome].text}</StandardBadge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {signIn.server && (
        <div className="space-y-3 lg:border-l lg:border-line lg:pl-6">
          <p className="text-sm font-semibold text-ink">Whole server (admin)</p>
          <div className="flex flex-wrap gap-1.5">
            <StandardBadge tone={signIn.server.failedCount > 0 ? "warn" : "neutral"}>
              {signIn.server.failedCount} failed sign-in{signIn.server.failedCount === 1 ? "" : "s"}
            </StandardBadge>
            <StandardBadge tone={signIn.server.unknownAccountCount > 0 ? "warn" : "neutral"}>
              {signIn.server.unknownAccountCount} for unknown accounts
            </StandardBadge>
            <StandardBadge tone={signIn.server.blockedCount > 0 ? "danger" : "neutral"}>
              {signIn.server.blockedCount} blocked by lockout
            </StandardBadge>
          </div>
          {signIn.server.topIps.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1">Most failures from</p>
              <ul className="text-sm space-y-0.5">
                {signIn.server.topIps.map((r) => (
                  <li key={r.ip} className="flex justify-between gap-3">
                    <span className="font-mono text-xs text-ink">{r.ip}</span>
                    <span className="text-muted tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {signIn.server.topAccounts.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1">Accounts with most failures</p>
              <ul className="text-sm space-y-0.5">
                {signIn.server.topAccounts.map((r) => (
                  <li key={r.email} className="flex justify-between gap-3">
                    <span className="text-ink truncate">{r.email}</span>
                    <span className="text-muted tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
