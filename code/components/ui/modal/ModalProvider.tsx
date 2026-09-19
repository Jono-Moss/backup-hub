"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// Replaces window.confirm/window.alert app-wide. Browsers let a user check
// "prevent this page from creating additional dialogs" after a couple of
// native alert()/confirm() popups, which silently turns every future
// confirm() into an automatic "OK" (Chrome/Firefox both treat a suppressed
// confirm() as accepted) — meaning a person could end up deleting or
// restoring backups without ever seeing the warning they thought they'd
// get. An in-page modal can't be suppressed that way.

type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type AlertOptions = {
  message: string;
  title?: string;
};

type PendingConfirm = { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void };
type PendingAlert = { kind: "alert"; opts: AlertOptions; resolve: () => void };
type Pending = PendingConfirm | PendingAlert;

type ModalContextValue = {
  /** Replacement for window.confirm — resolves true/false instead of blocking the thread. */
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  /** Replacement for window.alert. */
  alertUser: (opts: AlertOptions | string) => Promise<void>;
};

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((optsOrMessage: ConfirmOptions | string) => {
    const opts = typeof optsOrMessage === "string" ? { message: optsOrMessage } : optsOrMessage;
    return new Promise<boolean>((resolve) => {
      setPending({ kind: "confirm", opts, resolve });
    });
  }, []);

  const alertUser = useCallback((optsOrMessage: AlertOptions | string) => {
    const opts = typeof optsOrMessage === "string" ? { message: optsOrMessage } : optsOrMessage;
    return new Promise<void>((resolve) => {
      setPending({ kind: "alert", opts, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(result);
    else pending.resolve();
    setPending(null);
  };

  return (
    <ModalContext.Provider value={{ confirm, alertUser }}>
      {children}

      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Escape") close(false);
          }}
        >
          <div className="w-full max-w-sm rounded-md border border-line bg-white p-6 shadow-lg">
            {pending.opts.title && <h2 className="text-base font-semibold text-ink mb-1">{pending.opts.title}</h2>}
            <p className="text-sm text-ink mb-6 whitespace-pre-line">{pending.opts.message}</p>

            <div className="flex justify-end gap-2">
              {pending.kind === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => close(false)}
                    autoFocus
                    className="rounded-md border border-line text-ink text-sm font-medium px-4 py-2 hover:border-primary transition-colors"
                  >
                    {pending.opts.cancelLabel ?? "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={() => close(true)}
                    className={`rounded-md text-white text-sm font-medium px-4 py-2 border-b-2 hover:border-b-transparent transition-colors ${
                      pending.opts.danger
                        ? "bg-danger border-b-danger-dark"
                        : "bg-primary border-b-primary-dark"
                    }`}
                  >
                    {pending.opts.confirmLabel ?? "Confirm"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => close(true)}
                  autoFocus
                  className="rounded-md bg-primary text-white text-sm font-medium px-4 py-2 border-b-2 border-b-primary-dark hover:border-b-transparent transition-colors"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error("useModal() must be used within <ModalProvider>");
  }
  return ctx;
}