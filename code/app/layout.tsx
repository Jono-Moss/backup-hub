import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { StandardFooter } from "@/components/ui/standard/StandardFooter";
import { StandardHeader } from "@/components/ui/standard/StandardHeader";
import { ModalProvider } from "@/components/ui/modal/ModalProvider";

export const metadata: Metadata = {
    title: "Backup Hub",
    description: "Scheduled, encrypted database backups for MySQL and Postgres.",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();

    return (
        <html lang="en">
            <body className="font-sans antialiased">
                <ModalProvider>
                    <div className="flex min-h-screen flex-col">

                        <StandardHeader user={user} />

                        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                            {children}
                        </main>

                        <StandardFooter />

                    </div>
                </ModalProvider>
            </body>
        </html>
    );
}