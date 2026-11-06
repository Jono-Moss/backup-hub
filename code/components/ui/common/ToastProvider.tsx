"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LuCircleCheck, LuCircleX, LuX } from "react-icons/lu";

// Small confirmation messages ("Settings saved", "Couldn't delete …") that
// slide in at the bottom of the screen and go away on their own. Errors stay
// up longer than successes, and both can be dismissed. Announced to screen
// readers through an aria-live region.

type Tone = "success" | "error";
type Toast = { id: number; tone: Tone; message: string };

type ToastContextValue = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION: Record<Tone, number> = { success: 4000, error: 8000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++;
    // Keep the stack short: the newest three.
    setToasts((all) => [...all.slice(-2), { id, tone, message }]);
  }, []);

  const value = useRef<ToastContextValue>({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
  }).current;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DURATION[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast.tone, onDismiss]);

  const isError = toast.tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-white px-4 py-3 shadow-lg animate-[toast-in_160ms_ease-out] ${
        isError ? "border-danger" : "border-primary"
      }`}
    >
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${isError ? "text-danger" : "text-primary"}`}>
        {isError ? <LuCircleX size={18} /> : <LuCircleCheck size={18} />}
      </span>
      <p className="flex-1 text-sm text-ink break-words">{toast.message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-muted hover:text-ink">
        <LuX size={16} />
      </button>
    </div>
  );
}

// Outside the provider (shouldn't happen — it wraps the whole app in
// app/layout.tsx) messages go to the console rather than crashing the page.
const consoleFallback: ToastContextValue = {
  success: (m) => console.info("[toast]", m),
  error: (m) => console.error("[toast]", m),
};

export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? consoleFallback;
}
