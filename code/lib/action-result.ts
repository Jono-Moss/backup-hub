// How server actions report an outcome the user should see.
//
// Next.js hides the message of any error *thrown* from a server action in
// production builds ("An error occurred in the Server Components render…"),
// so a validation message like "Current password is incorrect" would never
// reach the user if thrown. Actions return `fail("…")` for those instead;
// the client feedback helpers (components/ui/common/useActionFeedback.ts)
// turn it into an error toast. Anything still thrown is treated as an
// unexpected error and shown generically.

export type ActionFailure = { ok: false; message: string };

export function fail(message: string): ActionFailure {
  return { ok: false, message };
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { message?: unknown }).message === "string"
  );
}
