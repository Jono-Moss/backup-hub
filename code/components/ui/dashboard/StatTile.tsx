type Tone = "good" | "bad" | "warn" | "neutral";

const iconTone: Record<Tone, string> = {
  good: "bg-primary-light text-primary-dark",
  bad: "bg-danger-light text-danger",
  warn: "bg-warn-light text-warn",
  neutral: "bg-paper text-muted",
};

// One headline number. The value stays in ink; the tinted icon carries the
// status, and the label always says what it is, so colour is never alone.
export function StatTile({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-md [&>svg]:size-4 ${iconTone[tone]}`}>
          {icon}
        </span>
        <span className="text-sm text-muted">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
    </div>
  );
}
