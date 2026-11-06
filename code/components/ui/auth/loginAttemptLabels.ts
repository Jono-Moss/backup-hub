import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { LoginMethod, LoginOutcome } from "@/db/schema";

// Labels for the sign-in history (dashboard and Account page). Server-side
// only: it imports next-intl/server.

type Tone = "primary" | "danger" | "warn";

const OUTCOME_TONE: Record<LoginOutcome, Tone> = {
  success: "primary",
  bad_password: "warn",
  unknown_user: "warn",
  bad_2fa: "danger",
  passkey_failed: "warn",
  locked_out: "danger",
  unlocked: "primary",
  password_reset: "primary",
};

type SignInsT = (key: string, values?: Record<string, string>) => string;

// "Firefox on Linux" — enough to recognise a device, not a full UA parser.
// Browser and OS names are proper nouns; only the joining words translate.
function describe(ua: string | null, t: SignInsT): string {
  if (!ua) return t("unknownDevice");
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
              ? t("script")
              : t("browser");
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
  return os ? t("browserOnOs", { browser, os }) : browser;
}

function build(t: SignInsT) {
  return {
    outcome: (o: LoginOutcome) => ({ text: t(`outcome.${o}`), tone: OUTCOME_TONE[o] }),
    method: (m: LoginMethod) => t(`method.${m}`),
    describeUserAgent: (ua: string | null) => describe(ua, t),
  };
}

/** For non-async server components. */
export function useLoginLabels() {
  return build(useTranslations("signIns") as unknown as SignInsT);
}

/** For async server components. */
export async function getLoginLabels() {
  return build((await getTranslations("signIns")) as unknown as SignInsT);
}
