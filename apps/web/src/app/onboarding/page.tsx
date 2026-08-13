import { redirect } from "next/navigation";
import { getMe } from "@/lib/api-server";
import { RoleChooser } from "./role-chooser";

export const metadata = { title: "Choose your role" };

export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === "ATHLETE") redirect("/dashboard/athlete");
  if (me.role === "SPONSOR") redirect("/dashboard/sponsor");
  if (me.role === "ADMIN") redirect("/admin");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-20 text-center">
      <p className="eyebrow text-marigold">Nearly there</p>
      <h1 className="mt-4 text-h1 font-semibold">
        Which side of this are you on, {me.name.split(" ")[0]}?
      </h1>
      <p className="mt-4 max-w-md leading-relaxed text-slate">
        A one-time choice for your account. It decides which dashboard you land in &mdash;
        not what you can see.
      </p>
      <RoleChooser />
    </div>
  );
}
