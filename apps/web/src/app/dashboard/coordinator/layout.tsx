import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";

export default async function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === null) redirect("/onboarding");
  if (me.role !== "COORDINATOR" && me.role !== "ADMIN") redirect("/");
  // `theme-app`: the dashboard system, scoped (packages/theme/README.md).
  return <div className="theme-app min-h-full">{children}</div>;
}
