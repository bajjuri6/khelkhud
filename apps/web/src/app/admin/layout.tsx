import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");
  return <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>;
}
