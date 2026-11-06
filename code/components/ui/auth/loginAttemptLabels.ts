import type { LoginMethod, LoginOutcome } from "@/db/schema";

export const OUTCOME_LABEL: Record<LoginOutcome, { text: string; tone: "primary" | "danger" | "warn" }> = {
  success: { text: "Signed in", tone: "primary" },
  bad_password: { text: "Wrong password", tone: "warn" },
  unknown_user: { text: "Unknown account", tone: "warn" },
  bad_2fa: { text: "Wrong 2FA code", tone: "danger" },
  passkey_failed: { text: "Passkey rejected", tone: "warn" },
  locked_out: { text: "Blocked — locked out", tone: "danger" },
  unlocked: { text: "Unlocked by an admin", tone: "primary" },
  password_reset: { text: "Password reset by email", tone: "primary" },
};

export const METHOD_LABEL: Record<LoginMethod, string> = {
  password: "Password",
  totp: "Password + authenticator",
  recovery_code: "Password + recovery code",
  passkey: "Passkey",
};

// "Firefox on Linux" — enough to recognise a device, not a full UA parser.
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl|wget|python|node|go-http/i.test(ua)
              ? "Script"
              : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}
