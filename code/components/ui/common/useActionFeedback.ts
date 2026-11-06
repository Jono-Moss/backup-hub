"use client";

import { useCallback } from "react";
import { isActionFailure } from "@/lib/action-result";
import { useToast } from "@/components/ui/common/ToastProvider";

const GENERIC_ERROR = "Something went wrong — please try again.";

// redirect() / notFound() inside a server action surface on the client as
// errors with these digests. They're navigation, not failures: rethrow them
// so Next.js can carry them out.
function isNavigation(err: unknown) {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest);
}

// Thrown messages are only meaningful in development: production replaces
// them with Next.js's generic "Server Components render" text.
function messageOf(err: unknown) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message || /Server Components render|unexpected response/i.test(message)) return GENERIC_ERROR;
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

  return useCallback(
    async <T,>(fn: () => Promise<T> | T, options: FeedbackOptions = {}): Promise<boolean> => {
      try {
        const result = await fn();
        if (isActionFailure(result)) {
          toast.error(result.message);
          return false;
        }
        const success = typeof options.success === "function" ? options.success(result) : options.success;
        if (success) toast.success(success);
        return true;
      } catch (err) {
        if (isNavigation(err)) throw err;
        console.error(err);
        toast.error(messageOf(err));
        return false;
      }
    },
    [toast]
  );
}
