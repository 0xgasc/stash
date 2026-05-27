import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { I18nProvider } from "./lib/i18n/client";
import { getServerLocale } from "./lib/i18n/server";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Stash - Eternal Space for Your Files",
  description: "Permanent storage on Arweave. Upload once, access eternally. True digital permanence.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  return (
    <html lang={locale}>
      <body className={`${spaceMono.variable} font-mono antialiased`}>
        <I18nProvider locale={locale}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
