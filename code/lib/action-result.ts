// How server actions report an outcome the user should see.
//
// Next.js hides the message of any error *thrown* from a server action in
// production builds ("An error occurred in the Server Components render…"),
// so a validation message like "Current password is incorrect" would never
// reach the user if thrown. Actions return `fail("…")` for those instead;
// the client feedback helpers (components/ui/common/useActionFeedback.ts)
// turn it into an error toast. An action may also return
// `{ ok: true, message }` to choose its own success toast. Anything still
// thrown is treated as an unexpected error and shown generically.

export type ActionFailure = { ok: false; message: string };

export function fail(message: string): ActionFailure {
  return { ok: false, message };
}

/** A success that carries its own message, e.g. "Signed out 2 other sessions". */
export type ActionSuccess = { ok: true; message?: string };

export function successMessageOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { ok?: unknown; message?: unknown };
  return v.ok === true && typeof v.message === "string" ? v.message : null;
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { message?: unknown }).message === "string"
  );
}
