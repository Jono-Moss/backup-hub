import Link from "next/link";
import { useTranslations } from "next-intl";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

export const RUNS_PAGE_SIZE = 10;

/** Parses ?runsPage= into a page number, or "all". Out-of-range pages are clamped. */
export function parseRunsPage(raw: string | string[] | undefined, total: number): number | "all" {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "all") return "all";
  const pages = Math.max(1, Math.ceil(total / RUNS_PAGE_SIZE));
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), pages) : 1;
}

export function paginateRuns<T>(runs: T[], page: number | "all"): T[] {
  if (page === "all") return runs;
  return runs.slice((page - 1) * RUNS_PAGE_SIZE, page * RUNS_PAGE_SIZE);
}

// Links keep #backups so the page lands back on the history after paging.
function href(page: number | "all") {
  return page === 1 ? "?#backups" : `?runsPage=${page}#backups`;
}

export function RunsPagination({ page, total }: { page: number | "all"; total: number }) {
  const t = useTranslations("runs");
  if (total <= RUNS_PAGE_SIZE) return null;
  const pages = Math.ceil(total / RUNS_PAGE_SIZE);

  const linkStyle = "inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-ink hover:border-primary";
  const disabledStyle = "inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 opacity-40";

  if (page === "all") {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-muted">
        <span>{t("showingAll", { total })}</span>
        <Link href={href(1)} className="text-primary hover:underline">
          {t("perPage", { count: RUNS_PAGE_SIZE })}
        </Link>
      </div>
    );
  }

  const from = (page - 1) * RUNS_PAGE_SIZE + 1;
  const to = Math.min(page * RUNS_PAGE_SIZE, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-muted">
      <span>
        {t("showingRange", { from, to, total })}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkStyle}>
            <LuChevronLeft size={14} aria-hidden="true" /> {t("newer")}
          </Link>
        ) : (
          <span className={disabledStyle}>
            <LuChevronLeft size={14} aria-hidden="true" /> {t("newer")}
          </span>
        )}
        <span className="px-1">
          {t("pageOf", { page, pages })}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={linkStyle}>
            {t("older")} <LuChevronRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <span className={disabledStyle}>
            {t("older")} <LuChevronRight size={14} aria-hidden="true" />
          </span>
        )}
        <Link href={href("all")} className="ml-2 text-primary hover:underline">
          {t("showAll")}
        </Link>
      </div>
    </div>
  );
}
