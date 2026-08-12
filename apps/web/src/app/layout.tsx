import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMe } from "@/lib/api-server";

// Brand fonts (docs/brand-guidelines.md §4). The `variable` names override the fallback
// stacks that @khelkhud/theme/firstlight.css declares on :root — so the theme package
// stays the single record of what the brand specifies, and next/font just supplies the
// actual files. Both are variable fonts: no weight array, no per-weight downloads.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--kk-font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--kk-font-sans",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://khelkhud.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "khelkhud — Talent is everywhere. Support isn't.",
    template: "%s | khelkhud",
  },
  description:
    "khelkhud connects Telangana's athletes to the people who can fund them — equipment, coaching, entry fees, travel — and shows every sponsor exactly where their money went, with receipts.",
  applicationName: "khelkhud",
  keywords: [
    "sports sponsorship India",
    "Telangana athletes",
    "sponsor an athlete",
    "grassroots sport funding",
    "athlete sponsorship platform",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "khelkhud",
    url: SITE_URL,
    title: "khelkhud — Talent is everywhere. Support isn't.",
    description:
      "Find an athlete in Telangana, fund one specific thing they need, and follow the receipts all the way to the result.",
  },
  twitter: {
    card: "summary_large_image",
    title: "khelkhud — Talent is everywhere. Support isn't.",
    description:
      "Find an athlete in Telangana, fund one specific thing they need, and follow the receipts all the way to the result.",
  },
  robots: {
    // Staging and preview deploys must not be indexed. Set NEXT_PUBLIC_INDEXABLE=false there.
    index: process.env.NEXT_PUBLIC_INDEXABLE !== "false",
    follow: process.env.NEXT_PUBLIC_INDEXABLE !== "false",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "khelkhud",
      url: SITE_URL,
      slogan: "Talent is everywhere. Support isn't.",
      description:
        "A sports talent and sponsorship platform closing the gap between an athlete's potential and the resources they need, with transparent, receipt-backed tracking of every rupee.",
      areaServed: ["Telangana", "India"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "khelkhud",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const me = await getMe();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="flex min-h-svh flex-col">
          <SiteHeader me={me} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
        <Toaster richColors />
      </body>
    </html>
  );
}
