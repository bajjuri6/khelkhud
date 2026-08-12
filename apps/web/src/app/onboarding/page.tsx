import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";
import { RoleChooser } from "./role-chooser";

export const metadata = { title: "Choose your role" };

export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === "PLAYER") redirect("/dashboard/player");
  if (me.role === "SPONSOR") redirect("/dashboard/sponsor");
  if (me.role === "ADMIN") redirect("/admin");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">How will you use khelkhud?</h1>
      <p className="mt-2 text-muted-foreground">
        This is a one-time choice for your account, {me.name.split(" ")[0]}.
      </p>
      <RoleChooser />
    </div>
  );
}
