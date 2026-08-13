import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";

export default async function AthleteDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === null) redirect("/onboarding");
  if (me.role !== "ATHLETE") redirect(me.role === "ADMIN" ? "/admin" : "/dashboard/sponsor");
  // `theme-app`: the dashboard system, scoped (packages/theme/README.md).
  return (
    <div className="theme-app min-h-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
