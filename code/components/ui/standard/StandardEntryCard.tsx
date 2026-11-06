// One configured item in a section list (a notification, a save location, a
// share). The tinted card makes it read as "this is set up", distinct from
// the add forms, which only appear inside an AddableSection's panel.
export function StandardEntryCard({
  title,
  meta,
  badges,
  actions,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-line bg-paper/60 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-ink break-words">{title}</p>
        {meta && <p className="text-xs text-muted break-words">{meta}</p>}
        {badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 sm:shrink-0">{actions}</div>}
    </li>
  );
}

export function StandardEntryList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}
