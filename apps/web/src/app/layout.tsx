import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMe } from "@/lib/api-server";
import { foundation } from "@khelkhud/theme";
import { BRAND, INDEXABLE, SITE_URL } from "@/lib/seo";

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
    index: INDEXABLE,
    follow: INDEXABLE,
  },
};

// Organization + WebSite, emitted on every page.
//
// This graph is what an answer engine reads to decide what khelkhud IS before it reads a
// word of copy, so it states the scope (Telangana, all 33 districts), the backing
// organisation, and the sports covered — the three facts most likely to be asked about and
// most likely to be got wrong from prose alone.
//
// @id values are stable so the FAQPage and BreadcrumbList blocks on other pages resolve
// against the same entity rather than describing a second, unrelated organisation.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: BRAND.name,
      alternateName: "Khel Khud",
      url: SITE_URL,
      slogan: BRAND.tagline,
      description: BRAND.description,
      logo: `${SITE_URL}/brand/hero-six.png`,
      areaServed: {
        "@type": "AdministrativeArea",
        name: "Telangana",
        containedInPlace: { "@type": "Country", name: "India" },
      },
      // The backing organisation. `parentOrganization` rather than `funder`: this is who
      // khelkhud operates under, not merely who paid for something.
      parentOrganization: {
        "@type": "Organization",
        name: foundation.name,
      },
      knowsAbout: [
        "sports sponsorship",
        "grassroots athletics",
        "athlete funding",
        "Telangana sport",
        "transparent charitable giving",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: BRAND.name,
      description: BRAND.description,
      publisher: { "@id": `${SITE_URL}/#org` },
      inLanguage: "en-IN",
      // Tells search engines the site has its own search, and how to drive it.
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/athletes?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
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
