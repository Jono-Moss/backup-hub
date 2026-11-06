type BadgeTone = "neutral" | "primary" | "warn" | "danger";

const toneStyle: Record<BadgeTone, string> = {
  neutral: "bg-paper text-muted border-line",
  primary: "bg-primary-light text-primary-dark border-primary-light",
  warn: "bg-warn-light text-warn border-warn-light",
  danger: "bg-danger-light text-danger border-danger-light",
};

/** Small status pill, e.g. "On failure", "Disabled", "Task-only". */
export function StandardBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneStyle[tone]}`}>
      {children}
    </span>
  );
}
