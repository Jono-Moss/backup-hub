import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { StandardFooter } from "@/components/ui/standard/StandardFooter";
import { StandardHeader } from "@/components/ui/standard/StandardHeader";
import { ModalProvider } from "@/components/ui/modal/ModalProvider";
import { ToastProvider } from "@/components/ui/common/ToastProvider";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("meta");
    return { title: "Backup Hub", description: t("description") };
}

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

    return (
        <html lang={locale}>
            <body className="font-sans antialiased">
                {/* Messages and locale come from i18n/request.ts. */}
                <NextIntlClientProvider>
                <ToastProvider>
                <ModalProvider>
                    <div className="flex min-h-screen flex-col">

                        <StandardHeader user={user} />

                        <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-6 sm:py-8">
                            {children}
                        </main>

                        <StandardFooter />

                    </div>
                </ModalProvider>
                </ToastProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}