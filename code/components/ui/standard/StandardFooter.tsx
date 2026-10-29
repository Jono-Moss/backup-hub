'use client'

import Image from "next/image";
import { FaGithub } from "react-icons/fa";
import { BsTwitterX } from "react-icons/bs";
import { FaMastodon } from "react-icons/fa";
import byteswopLogoImg from '@/public/byteswop-logo.png';
import myfinLogoImg from '@/public/myfin-logo.png';

// Phones: the two product links side by side, then one row with the social
// icons and copyright — kept short so it doesn't take over the screen.
// Larger screens: products and socials in three columns, copyright below.

const SOCIAL_LINK =
    "flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl border border-line bg-white text-slate-400 transition-all duration-300 hover:-translate-y-0.5 hover:text-slate-600";

const LABEL = "mb-1.5 sm:mb-2 text-[9px] sm:text-[10px] font-semibold uppercase leading-tight tracking-[0.15em] sm:tracking-[0.25em] text-slate-500";

export function StandardFooter() {
    return (
        <footer className="border-t border-line bg-gray-50">
            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-5 sm:py-8">

                <div className="grid grid-cols-2 items-center gap-y-5 sm:grid-cols-3">

                    {/* Byteswop */}
                    <div className="flex flex-col items-center px-2 text-center sm:items-start sm:px-0 sm:text-left">
                        <p className={LABEL}>A product by</p>
                        <a
                            href="https://byteswop.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block transition duration-300 hover:scale-105"
                        >
                            <Image src={byteswopLogoImg} height={40} alt="Byteswop Logo" className="h-7 w-auto sm:h-10" />
                        </a>
                    </div>

                    {/* MyFin */}
                    <div className="flex flex-col items-center px-2 text-center border-l border-line sm:border-x">
                        <p className={LABEL}>Try our accounting software</p>
                        <a
                            href="https://myfin-hub.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block transition duration-300 hover:scale-105"
                        >
                            <Image src={myfinLogoImg} height={40} alt="MyFin Logo" className="h-7 w-auto sm:h-10" />
                        </a>
                    </div>

                    {/* Social */}
                    <div className="col-span-2 flex items-center justify-center gap-2 sm:col-span-1 sm:justify-end sm:gap-3">
                        <a
                            href="https://github.com/Jono-Moss/backup-hub"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="GitHub"
                            title="GitHub"
                            className={SOCIAL_LINK}
                        >
                            <FaGithub className="h-4 w-4 sm:h-5 sm:w-5" />
                        </a>

                        <a
                            href="https://x.com/ByteswopSocials"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="X"
                            title="X"
                            className={SOCIAL_LINK}
                        >
                            <BsTwitterX className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" />
                        </a>

                        <a
                            href="https://mastodon.social/@byteswop"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Mastodon"
                            title="Mastodon"
                            className={SOCIAL_LINK}
                        >
                            <FaMastodon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </a>
                    </div>
                </div>

                {/* Copyright */}
                <div className="mt-5 sm:mt-8 flex flex-col items-center gap-1 border-t border-line pt-4 sm:pt-5 text-center sm:flex-row sm:justify-between">
                    <p className="text-xs text-slate-500">
                        © 2026 Byteswop · Backup Hub · Open Source ·{" "}
                        <a
                            href="https://github.com/Jono-Moss/backup-hub/blob/main/LICENSE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-slate-400 transition-colors hover:text-slate-600"
                        >
                            MIT License
                        </a>
                    </p>

                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        Backup the world
                    </p>
                </div>
            </div>
        </footer>
    )
}
