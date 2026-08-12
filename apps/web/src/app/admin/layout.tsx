import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/sponsorships", label: "Sponsorships" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/settings", label: "Sports & Locations" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-1 border-b pb-3 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
