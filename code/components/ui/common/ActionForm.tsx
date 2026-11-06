"use client";

import { createContext, useContext, useRef, useTransition, type ReactNode, type RefObject } from "react";
import { useActionFeedback, type FeedbackOptions } from "@/components/ui/common/useActionFeedback";

// A <form> that runs a server action and tells the user how it went (see
// useActionFeedback). Use it for every form that changes something.
//
// It submits through onSubmit rather than `<form action>` on purpose: React
// 19 clears a form after an action runs even when it failed, which would
// throw away what the user typed. Here fields are only cleared after a
// success, and only with `resetOnSuccess` (for "add" forms — edit forms keep
// their values). StandardSubmitButton reads the pending state from the
// context below.

const ActionFormContext = createContext<{ pending: boolean } | null>(null);

/** Pending state of the surrounding ActionForm, or null outside one. */
export function useActionFormStatus() {
  return useContext(ActionFormContext);
}

export function ActionForm({
  action,
  success,
  resetOnSuccess = false,
  onSuccess,
  className,
  id,
  formRef: externalRef,
  children,
}: {
  action: (formData: FormData) => Promise<unknown> | unknown;
  success?: FeedbackOptions["success"];
  resetOnSuccess?: boolean;
  onSuccess?: (result: unknown) => void;
  className?: string;
  id?: string;
  /** For components that also need the form element (e.g. to read it for a "Test" button). */
  formRef?: RefObject<HTMLFormElement | null>;
  children: ReactNode;
}) {
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const ownRef = useRef<HTMLFormElement>(null);
  const formRef = externalRef ?? ownRef;

  return (
    <ActionFormContext.Provider value={{ pending }}>
      <form
        ref={formRef}
        id={id}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const form = e.currentTarget;
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const formData = new FormData(form, submitter);
          startTransition(async () => {
            let result: unknown;
            const ok = await run(
              async () => {
                result = await action(formData);
                return result;
              },
              { success }
            );
            if (!ok) return;
            if (resetOnSuccess) formRef.current?.reset();
            onSuccess?.(result);
          });
        }}
      >
        {children}
      </form>
    </ActionFormContext.Provider>
  );
}
