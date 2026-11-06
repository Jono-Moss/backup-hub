// Title bar for a StandardSection: icon, title, optional count, a one-line
// description and the section's main action on the right, with a divider
// underneath so the header never blends into the content below it.
//
// `icon` is an element (<LuBell />), not a component, so server pages can
// pass it through client components.
export function StandardSectionHeader({
  title,
  icon,
  count,
  description,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-line pb-4 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary-dark [&>svg]:size-5"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-semibold text-ink leading-tight">
            {title}
            {count !== undefined && (
              <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-medium text-muted">
                {count}
              </span>
            )}
          </h2>
          {description && <p className="text-sm text-muted mt-1">{description}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-3 sm:shrink-0">{action}</div>}
    </div>
  );
}
