"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LuPlus, LuX } from "react-icons/lu";
import { StandardSection } from "@/components/ui/standard/StandardSection";
import { StandardSectionHeader } from "@/components/ui/standard/StandardSectionHeader";

export type AddTab = { key: string; label: string; content: React.ReactNode };

const AddPanelContext = createContext<{ close: () => void } | null>(null);

/** Lets a form inside the add panel close it (null outside an AddableSection). */
export function useAddPanel() {
  return useContext(AddPanelContext);
}

// A section whose list of configured items is always visible, while the
// forms for adding a new one stay hidden behind a "+ Add" button in the
// header. The panel opens below the list with its own tinted background and
// title, so it can't be mistaken for the existing entries.
//
// With several `tabs` (e.g. "Use a saved channel" / "Create new") the panel
// shows one at a time. The panel closes itself when `count` changes, i.e.
// after the add succeeded and the server re-rendered the list — unless
// `closeOnAdd` is false, for forms that show a result first (a new API key)
// and close the panel themselves via useAddPanel().
export function AddableSection({
  id,
  title,
  icon,
  description,
  count,
  canAdd,
  addLabel,
  panelTitle,
  tabs,
  emptyMessage,
  closeOnAdd = true,
  children,
}: {
  id: string;
  title: string;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  count: number;
  canAdd: boolean;
  addLabel: string;
  panelTitle: string;
  tabs: AddTab[];
  emptyMessage: string;
  closeOnAdd?: boolean;
  /** The list of existing entries — only rendered when count > 0. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(tabs[0]?.key);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(count);

  useEffect(() => {
    if (closeOnAdd && count !== previousCount.current) setOpen(false);
    previousCount.current = count;
  }, [count, closeOnAdd]);

  function openPanel() {
    setOpen(true);
    // Wait for the panel to render, then bring it into view.
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  const showAdd = canAdd && tabs.length > 0;
  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0];

  return (
    <StandardSection id={id}>
      <StandardSectionHeader
        title={title}
        icon={icon}
        count={count}
        description={description}
        action={
          showAdd && !open ? (
            <button
              type="button"
              onClick={openPanel}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white border-b-2 border-b-primary-dark hover:border-b-transparent shadow-inner"
            >
              <LuPlus size={16} aria-hidden="true" />
              {addLabel}
            </button>
          ) : undefined
        }
      />

      {count > 0 ? (
        children
      ) : (
        <div className="rounded-md border border-dashed border-line px-4 py-6 text-center">
          <p className="text-sm text-muted">{emptyMessage}</p>
          {showAdd && !open && (
            <button type="button" onClick={openPanel} className="mt-2 text-sm font-medium text-primary hover:underline">
              {addLabel}
            </button>
          )}
        </div>
      )}

      {showAdd && open && (
        <div
          ref={panelRef}
          className="mt-4 rounded-md border border-primary/40 bg-primary-light/40 p-4 sm:p-5 scroll-mt-32"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-ink">{panelTitle}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
            >
              <LuX size={16} aria-hidden="true" />
              Cancel
            </button>
          </div>

          {tabs.length > 1 && (
            <div role="tablist" className="mb-4 inline-flex rounded-md border border-line bg-white p-0.5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={t.key === activeTab?.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    t.key === activeTab?.key ? "bg-primary text-white" : "text-ink hover:text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <AddPanelContext.Provider value={{ close: () => setOpen(false) }}>
            <div role="tabpanel">{activeTab?.content}</div>
          </AddPanelContext.Provider>
        </div>
      )}
    </StandardSection>
  );
}
