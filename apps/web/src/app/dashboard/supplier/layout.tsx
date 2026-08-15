import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";

export default async function SupplierDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === null) redirect("/onboarding");
  // ADMIN passes, as on the coordinator dashboard: an admin needs to be able to see what a
  // supplier sees when one phones about their approval. The API still scopes everything to
  // the caller's own SupplierProfile, so an admin without one sees the empty state rather
  // than someone else's catalogue.
  if (me.role !== "SUPPLIER" && me.role !== "ADMIN") redirect("/");
  // `theme-app`: the dashboard system, scoped (packages/theme/README.md).
  return (
    <div className="theme-app min-h-full">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
