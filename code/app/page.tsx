import Link from "next/link";
import { listTasks } from "./tasks/actions";
import { StandardLinkButton } from "@/components/ui/standard/StandardLinkButton";
import { describeCron } from "@/lib/cron/cronUtils";

// Reads live data on every request rather than being statically generated —
// this also means `next build` never needs a reachable database.
export const dynamic = "force-dynamic";

const engineLabel: Record<string, string> = { mysql: "MySQL", postgres: "Postgres" };

export default async function DashboardPage() {
  const tasks = await listTasks();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Backup tasks</h1>
          <p className="text-sm text-muted mt-1">
            Each task owns one database connection, its own schedule, and retention.
          </p>
        </div>
        <StandardLinkButton href="/tasks/new" title="New task" variant="standard"/>
      </div>

      {tasks.length === 0 ? (
        <div className="border border-dashed border-line p-10 text-center">
          <p className="text-sm text-muted">No backup tasks yet.</p>
        </div>
      ) : (
        <div className="border border-line rounded-md bg-white divide-y divide-line">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:shadow-[inset_0_0px_8px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${task.enabled ? "bg-primary" : "bg-muted"}`}
                  title={task.enabled ? "Enabled" : "Disabled"}
                />
                <div>
                  <p className="text-sm font-medium text-ink">{task.name}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {engineLabel[task.engine]} · <span className="font-mono">{describeCron(task.cronExpression)}</span> · keep{" "}
                    {task.retentionCount}
                    {task.encryptionEnabled ? " · encrypted" : ""}
                  </p>
                </div>
              </div>
              <span className="text-muted text-sm">View</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
