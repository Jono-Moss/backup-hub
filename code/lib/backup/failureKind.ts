// Rough grouping of a backup or upload error message, so the dashboard can
// call out sign-in/credential problems (which need the user to act — a
// changed database password, an expired OneDrive/Google token) separately
// from the server being unreachable or anything else. Heuristic only: it
// reads the error text from mysqldump/pg_dump and the destination SDKs.

export type FailureKind = "auth" | "connection" | "other";

const AUTH_PATTERNS = [
  /access denied/i,
  /authentication failed/i,
  /password authentication/i,
  /permission denied/i,
  /not authori[sz]ed/i,
  /unauthori[sz]ed/i,
  /forbidden/i,
  /invalid[_ ]grant/i,
  /invalid[_ ]client/i,
  /token (has )?(expired|revoked)/i,
  /refresh token/i,
  /invalid credentials/i,
  /login failed/i,
  /\b40[13]\b/,
  /InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied/,
];

const CONNECTION_PATTERNS = [
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN/,
  /could not connect|can't connect|cannot connect|connection refused/i,
  /timed? ?out/i,
  /unknown (mysql )?server host|could not translate host name/i,
  /network is unreachable/i,
];

export function classifyFailure(message: string | null | undefined): FailureKind {
  if (!message) return "other";
  if (AUTH_PATTERNS.some((p) => p.test(message))) return "auth";
  if (CONNECTION_PATTERNS.some((p) => p.test(message))) return "connection";
  return "other";
}

export const FAILURE_KIND_LABEL: Record<FailureKind, string> = {
  auth: "Sign-in problem",
  connection: "Can't connect",
  other: "Error",
};
