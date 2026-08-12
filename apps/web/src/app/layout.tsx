import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import { getMe } from "@/lib/api-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "khelkhud — Support Talent. Build Futures.",
    template: "%s | khelkhud",
  },
  description:
    "Discover promising local athletes, support their journey, and see the impact of your sponsorship.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const me = await getMe();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex min-h-svh flex-col">
          <SiteHeader me={me} />
          <main className="flex-1">{children}</main>
        </div>
        <Toaster richColors />
      </body>
    </html>
  );
}
