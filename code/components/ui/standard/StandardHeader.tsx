'use client'

import { logout } from "@/app/login/actions";
import Image from "next/image";
import logoImg from '@/public/logo-light.png';
import { LuDoorOpen } from "react-icons/lu";
import { SessionUser } from "@/lib/auth/session";

type StandardHeaderProps = {
    user: SessionUser | null;
};

export function StandardHeader({ user }: StandardHeaderProps) {
    return (
        <header className="border-b border-line bg-white">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                <a href="/" className="font-semibold text-ink">
                    <Image
                        src={logoImg}
                        alt="Backup Hub Logo"
                        height={40}
                        className="w-auto"
                        loading="eager"
                    />
                </a>

                {user && (
                    <nav className="flex items-center gap-6 text-sm">
                        <a href="/" className="text-ink hover:text-primary">
                            Tasks
                        </a>

                        <a href="/api-keys" className="text-ink hover:text-primary">
                            API Keys
                        </a>

                        {user.role === "admin" && (
                            <a href="/notifications" className="text-ink hover:text-primary">
                                Notifications
                            </a>
                        )}

                        {user.role === "admin" && (
                            <a href="/users" className="text-ink hover:text-primary">
                                Users
                            </a>
                        )}

                        <a href="/account" className="text-ink hover:text-primary">
                            {user.name}
                        </a>

                        <form action={logout}>
                            <button
                                type="submit"
                                className="text-primary hover:text-danger"
                                title="Sign Out"
                                aria-label="Sign Out"
                            >
                                <LuDoorOpen size={24} />
                            </button>
                        </form>
                    </nav>
                )}
            </div>
        </header>
    );
}