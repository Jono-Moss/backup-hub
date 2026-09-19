'use client'

import Image from "next/image";
import { FaGithub } from "react-icons/fa";
import { BsTwitterX } from "react-icons/bs";
import { FaMastodon } from "react-icons/fa";
import byteswopLogoImg from '@/public/byteswop-logo.png';
import myfinLogoImg from '@/public/myfin-logo.png';

export function StandardFooter() {
    return (
        <footer className="border-t border-line bg-gray-50">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">

                <div className="mx-auto w-full max-w-5xl px-6 pt-2 pb-6">

                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:items-center">

                        {/* Byteswop */}
                        <div className="flex justify-center sm:justify-start">
                            <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                                    A product by
                                </p>

                                <a
                                    href="https://byteswop.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block transition duration-300 hover:scale-105"
                                >
                                    <Image
                                        src={byteswopLogoImg}
                                        height={40}
                                        width={undefined}
                                        alt="Byteswop Logo"
                                        className="w-auto"
                                    />
                                </a>
                            </div>
                        </div>

                        {/* MyFin */}
                        <div className="flex justify-center border-y border-slate/10 py-6 sm:border-x sm:border-y-0 sm:py-0">
                            <div className="flex flex-col items-center">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                                    Try our accounting software:
                                </p>

                                <a
                                    href="https://myfin-hub.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block transition duration-300 hover:scale-105"
                                >
                                    <Image
                                        src={myfinLogoImg}
                                        height={40}
                                        width={undefined}
                                        alt="MyFin Logo"
                                        className="w-auto"
                                    />
                                </a>
                            </div>
                        </div>

                        {/* Social */}
                        <div className="flex items-center justify-center gap-3 sm:justify-end">

                            <a
                                href="https://github.com/Jono-Moss/backup-hub"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="GitHub"
                                title="GitHub"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate/10 bg-white/5 text-slate-400 transition-all duration-300 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-purple-500/10 hover:text-slate-600"
                            >
                                <FaGithub size={21} />
                            </a>

                            <a
                                href="https://x.com/ByteswopSocials"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="X"
                                title="X"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate/10 bg-white/5 text-slate-400 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-slate-600"
                            >
                                <BsTwitterX size={18} />
                            </a>

                            <a
                                href="https://mastodon.social/@byteswop"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Mastodon"
                                title="Mastodon"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate/10 bg-white/5 text-slate-400 transition-all duration-300 hover:-translate-y-1 hover:border-pink-400/40 hover:bg-pink-500/10 hover:text-slate-600"
                            >
                                <FaMastodon size={21} />
                            </a>

                        </div>
                    </div>

                    {/* Copyright */}
                    <div className="mt-8 flex flex-col items-center justify-center gap-2 border-t border-slate/10 pt-5 text-center sm:flex-row sm:justify-between">

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
            </div>
        </footer>
    )
}