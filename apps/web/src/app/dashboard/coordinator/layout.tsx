import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";

const NAV = [
  { href: "/dashboard/coordinator", label: "Validation queue" },
  { href: "/dashboard/coordinator/requests", label: "Raise a request" },
  { href: "/dashboard/coordinator/institutions", label: "Places" },
];

export default async function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === null) redirect("/onboarding");
  if (me.role !== "COORDINATOR" && me.role !== "ADMIN") redirect("/");
  // `theme-app`: the dashboard system, scoped (packages/theme/README.md).
  return (
    <div className="theme-app min-h-full">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap gap-1 px-6 pt-8 text-sm">
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
