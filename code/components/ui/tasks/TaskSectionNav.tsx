"use client";

import { useEffect, useRef, useState } from "react";

export type SectionNavItem = { id: string; label: string; count?: number };

// Sticky jump menu for the task page. Highlights the section currently in
// view and smooth-scrolls to a section when clicked, leaving room for the
// site header (sticky on phones only) and this bar itself.
export function TaskSectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const [top, setTop] = useState(0);
  const navRef = useRef<HTMLElement>(null);

  // Height of the site header when it's sticky, so this bar sits under it.
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector("body header");
      const sticky = header && getComputedStyle(header).position === "sticky";
      setTop(sticky ? (header as HTMLElement).offsetHeight : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const offset = top + (navRef.current?.offsetHeight ?? 0) + 24;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(items[items.length - 1]?.id);
        return;
      }
      let current = items[0]?.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= offset) current = item.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items, top]);

  function jump(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const offset = top + (navRef.current?.offsetHeight ?? 0) + 12;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

  return (
    <nav
      ref={navRef}
      aria-label="Task sections"
      style={{ top }}
      className="sticky z-30 -mx-4 sm:mx-0 border-y sm:border border-line bg-white/95 backdrop-blur sm:rounded-md"
    >
      <ul className="flex gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                onClick={(e) => jump(e, item.id)}
                aria-current={isActive ? "true" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? "bg-primary-light text-primary-dark" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
                {item.count !== undefined && (
                  <span className={`text-xs ${isActive ? "text-primary-dark" : "text-muted"}`}>{item.count}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
