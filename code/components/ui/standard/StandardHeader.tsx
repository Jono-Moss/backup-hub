'use client'

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import Image from "next/image";
import logoImg from '@/public/logo-light.png';
import { LuChevronDown, LuDoorOpen, LuMenu, LuX } from "react-icons/lu";
import { SessionUser } from "@/lib/auth/session";

type StandardHeaderProps = {
    user: SessionUser | null;
};

// Navigation is grouped by who it's for:
//   - main links: the things you work with every day — tasks, and the save
//     locations / notification channels those tasks use;
//   - Admin menu (admins only): server-wide settings — users and system
//     notifications;
//   - your name menu: your own account settings and API keys.

// "/" only matches itself (and task pages); everything else matches its subpaths too.
function isActive(pathname: string, href: string) {
    if (href === "/") return pathname === "/" || pathname.startsWith("/tasks");
    return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
    const active = isActive(pathname, href);
    return (
        <a
            href={href}
            aria-current={active ? "page" : undefined}
            className={`py-1 border-b-2 ${active ? "text-primary border-primary" : "text-ink border-transparent hover:text-primary"}`}
        >
            {label}
        </a>
    );
}

function NavMenu({
    label,
    items,
    pathname,
    children,
}: {
    label: string;
    items: { href: string; label: string }[];
    pathname: string;
    children?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const active = items.some((i) => isActive(pathname, i.href));

    // Close on outside click or Escape.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-1 py-1 border-b-2 ${active ? "text-primary border-primary" : "text-ink border-transparent hover:text-primary"}`}
            >
                {label}
                <LuChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 mt-2 min-w-48 bg-white border border-line rounded-md shadow-md py-1 z-20">
                    {items.map((item) => (
                        <a
                            key={item.href}
                            role="menuitem"
                            href={item.href}
                            aria-current={isActive(pathname, item.href) ? "page" : undefined}
                            className={`block px-4 py-2 hover:bg-paper ${isActive(pathname, item.href) ? "text-primary" : "text-ink"}`}
                        >
                            {item.label}
                        </a>
                    ))}
                    {children}
                </div>
            )}
        </div>
    );
}

const MAIN_LINKS = [
    { href: "/", label: "Tasks" },
    { href: "/locations", label: "Save locations" },
    { href: "/notification-channels", label: "Notifications" },
];
const ADMIN_LINKS = [
    { href: "/users", label: "Users" },
    { href: "/notifications", label: "System notifications" },
];
const ACCOUNT_LINKS = [
    { href: "/account", label: "My account" },
    { href: "/api-keys", label: "API keys" },
];

function SignOutButton({ className }: { className: string }) {
    return (
        <form action={logout}>
            <button type="submit" className={`w-full flex items-center gap-2 text-left text-ink hover:text-danger ${className}`}>
                <LuDoorOpen size={16} />
                Sign out
            </button>
        </form>
    );
}

// Small screens: one ☰ button opening a panel with the same groups stacked.
// The panel is fixed between the header and the bottom of the screen and
// scrolls on its own, while the page behind it is locked — so a long menu
// on a short screen never drags the whole site along with it.
function MobileNav({ user, pathname }: { user: SessionUser; pathname: string }) {
    const [open, setOpen] = useState(false);
    const [top, setTop] = useState(0);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        // Start the panel right under the header (which is sticky on phones).
        const header = ref.current?.closest("header");
        setTop(header ? header.getBoundingClientRect().bottom : 0);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        // Close if the screen grows past the phone breakpoint (rotation, resize).
        const wide = window.matchMedia("(min-width: 768px)");
        const onWide = () => wide.matches && setOpen(false);
        // Lock the page behind the menu. Only <html>: also locking <body>
        // turns it into the scroll container and the sticky header scrolls away.
        const html = document.documentElement;
        const previous = html.style.overflow;
        html.style.overflow = "hidden";
        document.addEventListener("keydown", onKey);
        wide.addEventListener("change", onWide);
        return () => {
            html.style.overflow = previous;
            document.removeEventListener("keydown", onKey);
            wide.removeEventListener("change", onWide);
        };
    }, [open]);

    const groups = [
        { title: null, links: MAIN_LINKS },
        ...(user.role === "admin" ? [{ title: "Admin", links: ADMIN_LINKS }] : []),
        { title: user.name, links: ACCOUNT_LINKS },
    ];

    return (
        <div ref={ref} className="md:hidden">
            <button
                type="button"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                aria-controls="mobile-nav"
                onClick={() => setOpen(!open)}
                className="p-2 -mr-2 text-ink hover:text-primary"
            >
                {open ? <LuX size={24} /> : <LuMenu size={24} />}
            </button>
            {open && (
                <>
                <div
                    aria-hidden="true"
                    onClick={() => setOpen(false)}
                    className="fixed inset-x-0 bottom-0 bg-ink/30 z-30"
                    style={{ top }}
                />
                <nav
                    id="mobile-nav"
                    className="fixed inset-x-0 overflow-y-auto overscroll-contain bg-white border-b border-line shadow-md z-40 text-sm pb-[env(safe-area-inset-bottom)]"
                    style={{ top, maxHeight: `calc(100dvh - ${top}px)` }}
                >
                    {groups.map((group) => (
                        <div key={group.title ?? "main"} className="border-t border-line py-2">
                            {group.title && (
                                <p className="px-6 pt-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</p>
                            )}
                            {group.links.map((link) => {
                                const active = isActive(pathname, link.href);
                                return (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        aria-current={active ? "page" : undefined}
                                        className={`block px-6 py-3 border-l-4 ${active ? "border-primary text-primary bg-primary-light" : "border-transparent text-ink hover:bg-paper"}`}
                                    >
                                        {link.label}
                                    </a>
                                );
                            })}
                        </div>
                    ))}
                    <div className="border-t border-line py-2">
                        <SignOutButton className="px-6 py-3 hover:bg-paper" />
                    </div>
                </nav>
                </>
            )}
        </div>
    );
}

export function StandardHeader({ user }: StandardHeaderProps) {
    const pathname = usePathname() ?? "/";

    return (
        <header className="sticky top-0 z-40 md:static border-b border-line bg-white">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 md:py-4 flex items-center justify-between gap-4">
                <a href="/" className="font-semibold text-ink shrink-0">
                    <Image
                        src={logoImg}
                        alt="Backup Hub Logo"
                        height={40}
                        className="w-auto h-8 md:h-10"
                        loading="eager"
                    />
                </a>

                {user && (
                    <>
                        <nav className="hidden md:flex items-center gap-6 text-sm">
                            {MAIN_LINKS.map((link) => (
                                <NavLink key={link.href} href={link.href} label={link.label} pathname={pathname} />
                            ))}

                            {user.role === "admin" && <NavMenu label="Admin" pathname={pathname} items={ADMIN_LINKS} />}

                            <NavMenu label={user.name} pathname={pathname} items={ACCOUNT_LINKS}>
                                <div role="menuitem" className="border-t border-line mt-1 pt-1">
                                    <SignOutButton className="px-4 py-2 hover:bg-paper" />
                                </div>
                            </NavMenu>
                        </nav>

                        <MobileNav user={user} pathname={pathname} />
                    </>
                )}
            </div>
        </header>
    );
}
