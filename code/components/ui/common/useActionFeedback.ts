"use client";

import { useCallback } from "react";
import { isActionFailure, successMessageOf } from "@/lib/action-result";
import { useToast } from "@/components/ui/common/ToastProvider";
import { useTranslations } from "next-intl";


// redirect() / notFound() inside a server action surface on the client as
// errors with these digests. They're navigation, not failures: rethrow them
// so Next.js can carry them out.
function isNavigation(err: unknown) {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest);
}

// Thrown messages are only meaningful in development: production replaces
// them with Next.js's generic "Server Components render" text.
//
// "Server Action unavailable" / "Invalid Server Action request" mean the page
// was loaded from an older (or newer) build than the server is running — after
// a deploy, or a dev-server reload — and "unexpected response" usually means
// the request was redirected (e.g. the session ended). A refresh fixes all of
// them, so say so (the Next.js docs' "Deployment considerations" advice).
function messageOf(err: unknown, t: (key: "genericError" | "stalePage") => string) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/Server Action unavailable|Invalid Server Action request|Failed to find Server Action|unexpected response/i.test(message)) {
    return t("stalePage");
  }
  if (!message || /Server Components render/i.test(message)) return t("genericError");
  return message;
}

export type FeedbackOptions = {
  /** Toast shown when the action succeeds. Omit for no success toast. */
  success?: string | ((result: unknown) => string | null | undefined);
};

/**
 * Runs an action and reports the outcome as a toast: a returned
 * `fail("…")` or a thrown error becomes an error toast, anything else the
 * optional success toast. Resolves to whether it succeeded.
 */
export function useActionFeedback() {
  const toast = useToast();
  const t = useTranslations("common");

  return useCallback(
    async <T,>(fn: () => Promise<T> | T, options: FeedbackOptions = {}): Promise<boolean> => {
      try {
        const result = await fn();
        if (isActionFailure(result)) {
          toast.error(result.message);
          return false;
        }
        const success =
          successMessageOf(result) ??
          (typeof options.success === "function" ? options.success(result) : options.success);
        if (success) toast.success(success);
        return true;
      } catch (err) {
        if (isNavigation(err)) throw err;
        console.error(err);
        toast.error(messageOf(err, t));
        return false;
      }
    },
    [toast, t]
  );
}
