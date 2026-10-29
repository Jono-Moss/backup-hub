import { LuLoaderCircle, LuShieldAlert, LuShieldCheck } from "react-icons/lu";
import type { VerifyLevel, VerifyStatus } from "@/db/schema";
import { LocalTime } from "./LocalTime";

// The result of a backup's last check, shown under its status. The full
// message is in the tooltip, and spelled out for failures.
export function VerifyBadge({
  status,
  level,
  message,
  verifiedAt,
}: {
  status: VerifyStatus | null;
  level: VerifyLevel | null;
  message: string | null;
  verifiedAt: Date | null;
}) {
  if (status === "queued" || status === "running") {
    return (
      <span className="flex items-center gap-1 text-xs font-normal normal-case text-warn">
        <LuLoaderCircle size={13} className="animate-spin" aria-hidden="true" />
        {status === "queued" ? "Check queued…" : "Checking…"}
      </span>
    );
  }
  if (status === "passed") {
    return (
      <span className="flex items-center gap-1 text-xs font-normal normal-case text-primary" title={message ?? undefined}>
        <LuShieldCheck size={13} aria-hidden="true" />
        <span>
          {level === "restore" ? "Test-restored" : "Verified"}
          {verifiedAt && (
            <span className="text-muted">
              {" · "}
              <LocalTime value={verifiedAt} />
            </span>
          )}
        </span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="block text-xs font-normal normal-case text-danger" title={message ?? undefined}>
        <span className="flex items-center gap-1">
          <LuShieldAlert size={13} aria-hidden="true" />
          {level === "restore" ? "Test restore failed" : "Check failed"}
        </span>
        {message && <span className="block text-muted line-clamp-3 break-words">{message}</span>}
      </span>
    );
  }
  return <span className="block text-xs font-normal normal-case text-muted">Not checked yet</span>;
}
