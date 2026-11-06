import { useTranslations } from "next-intl";
import { useTimeAgo } from "./timeAgo";

const SLOTS = 14;

const style: Record<string, string> = {
  completed: "bg-primary",
  failed: "bg-danger",
  running: "bg-warn animate-pulse",
};


// A task's latest runs as a row of small bars, oldest → newest (left → right).
// Failed runs are drawn taller as well as red, so they stand out without
// relying on colour. Empty slots pad the row so every task lines up.
export function RunStrip({ runs }: { runs: { id: string; status: string; startedAt: Date }[] }) {
  const t = useTranslations("dashboard");
  const timeAgo = useTimeAgo();
  const label = (status: string) =>
    status === "completed" ? t("stripSucceeded") : status === "failed" ? t("stripFailed") : status === "running" ? t("stripRunning") : status;
  const pad = Math.max(0, SLOTS - runs.length);
  const failed = runs.filter((r) => r.status === "failed").length;

  return (
    <div
      className="flex items-end gap-0.5 h-4"
      role="img"
      aria-label={
        runs.length === 0 ? t("stripEmpty") : t("stripLabel", { count: runs.length, ok: runs.length - failed, failed })
      }
    >
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad-${i}`} className="w-1.5 h-2 rounded-sm bg-line" />
      ))}
      {runs.map((r) => (
        <span
          key={r.id}
          title={`${label(r.status)} · ${timeAgo(r.startedAt)}`}
          className={`w-1.5 rounded-sm ${r.status === "failed" ? "h-4" : "h-2.5"} ${style[r.status] ?? "bg-muted"}`}
        />
      ))}
    </div>
  );
}
