"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LuEllipsis } from "react-icons/lu";
import type { IconType } from "react-icons";

// A "⋯" menu of actions for one row. The same list of actions shows as a
// dropdown next to the button (desktop) or as a bottom drawer (phones), so
// both always offer the same things. Rows are icon + label (+ an optional
// one-line description); destructive ones go last, in red, after a divider.

export interface MenuAction {
  key: string;
  label: string;
  icon: IconType;
  /** One short line under the label — shown in the drawer, where there's room. */
  description?: string;
  /** Either an action to run, or a link to follow (e.g. a download). */
  onSelect?: () => void | Promise<void>;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function ActionMenu({
  actions,
  variant,
  label = "More actions",
  title,
  summary,
  busy = false,
}: {
  actions: MenuAction[];
  variant: "dropdown" | "sheet";
  /** Accessible name of the ⋯ button. */
  label?: string;
  /** Drawer header: what the actions apply to. */
  title?: ReactNode;
  summary?: ReactNode;
  /** Something started from the menu is still running. */
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (actions.length === 0) return null;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const select = (action: MenuAction) => {
    setOpen(false);
    void action.onSelect?.();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-ink transition-colors hover:border-primary hover:text-primary ${busy ? "animate-pulse" : ""}`}
      >
        <LuEllipsis size={18} aria-hidden="true" />
      </button>
      {open &&
        (variant === "dropdown" ? (
          <Dropdown anchor={triggerRef} actions={actions} onSelect={select} onClose={close} />
        ) : (
          <Sheet actions={actions} title={title} summary={summary} onSelect={select} onClose={close} />
        ))}
    </>
  );
}

// Splits off destructive actions so they always sit last, behind a divider.
function groups(actions: MenuAction[]) {
  return [actions.filter((a) => !a.danger), actions.filter((a) => a.danger)].filter((g) => g.length > 0);
}

function ActionRow({ action, onSelect, roomy }: { action: MenuAction; onSelect: (a: MenuAction) => void; roomy?: boolean }) {
  const Icon = action.icon;
  const className = `flex w-full items-start gap-3 text-left transition-colors disabled:opacity-40 ${
    roomy ? "px-5 py-3.5" : "px-3.5 py-2"
  } ${action.danger ? "text-danger hover:bg-danger-light" : "text-ink hover:bg-paper"} focus:outline-none focus-visible:bg-paper`;
  const content = (
    <>
      <Icon size={roomy ? 20 : 17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block">{action.label}</span>
        {roomy && action.description && <span className="block text-xs text-muted mt-0.5">{action.description}</span>}
      </span>
    </>
  );
  if (action.href && !action.disabled) {
    return (
      <a role="menuitem" href={action.href} className={className} onClick={() => onSelect({ ...action, onSelect: undefined })}>
        {content}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" disabled={action.disabled} className={className} onClick={() => onSelect(action)}>
      {content}
    </button>
  );
}

// Always calls the latest callback without re-running effects that use it.
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// Arrow keys move between items; Escape closes. Focuses the first item on open.
function useMenuKeys(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useLatest(onClose);
  useEffect(() => {
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close.current();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, close]);
}

const MENU_WIDTH = 224;

function Dropdown({
  anchor,
  actions,
  onSelect,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  actions: MenuAction[];
  onSelect: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useMenuKeys(ref, onClose);

  // Positioned against the window (fixed), not the row, so a scrolling
  // table can't clip it. Opens upwards when there's no room below.
  useLayoutEffect(() => {
    const button = anchor.current?.getBoundingClientRect();
    const menu = ref.current?.getBoundingClientRect();
    if (!button || !menu) return;
    const below = button.bottom + 6;
    const top = below + menu.height > window.innerHeight - 8 ? Math.max(8, button.top - 6 - menu.height) : below;
    const left = Math.min(Math.max(8, button.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPos({ top, left });
  }, [anchor]);

  const close = useLatest(onClose);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close.current();
    };
    // A fixed menu would drift away from its row on scroll — just close it.
    const onMove = () => close.current();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [anchor, close]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
      className="z-50 rounded-md border border-line bg-white py-1 text-sm shadow-lg"
    >
      {groups(actions).map((group, i) => (
        <div key={i} className={i > 0 ? "mt-1 border-t border-line pt-1" : ""}>
          {group.map((a) => (
            <ActionRow key={a.key} action={a} onSelect={onSelect} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Sheet({
  actions,
  title,
  summary,
  onSelect,
  onClose,
}: {
  actions: MenuAction[];
  title?: ReactNode;
  summary?: ReactNode;
  onSelect: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  useMenuKeys(ref, onClose);

  // Lock the page behind the drawer (only <html>, like the mobile nav).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  // Swipe down on the handle/header to dismiss.
  const onTouchStart = (e: React.TouchEvent) => (dragStart.current = e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current !== null) setDrag(Math.max(0, e.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    if (drag > 80) onClose();
    else setDrag(0);
    dragStart.current = null;
  };

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={ref}
        role="menu"
        aria-modal="true"
        style={{ transform: `translateY(${drag}px)`, transition: dragStart.current === null ? "transform 150ms" : "none" }}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl"
      >
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="sticky top-0 bg-white px-5 pt-2.5 pb-3 border-b border-line">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
          {title && <div className="text-sm font-semibold text-ink break-all">{title}</div>}
          {summary && <div className="mt-1 text-xs text-muted">{summary}</div>}
        </div>
        {groups(actions).map((group, i) => (
          <div key={i} className={`py-1 text-sm ${i > 0 ? "border-t border-line" : ""}`}>
            {group.map((a) => (
              <ActionRow key={a.key} action={a} onSelect={onSelect} roomy />
            ))}
          </div>
        ))}
        <div className="border-t border-line p-3">
          <button type="button" onClick={onClose} className="w-full rounded-md py-2.5 text-sm font-medium text-ink hover:bg-paper">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
