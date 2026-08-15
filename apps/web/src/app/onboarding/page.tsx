import { redirect } from "next/navigation";
import { getMe, type Me } from "@/lib/api-server";
import { RoleChooser } from "./role-chooser";

export const metadata = { title: "Choose your role" };

// Every non-null role must resolve to a real page. A coordinator or supplier is appointed
// by an admin, so they arrive here already roled and would otherwise be shown a chooser
// that cannot describe them — or worse, be bounced here again by the enumerated checks
// this replaces, which only knew about athletes, sponsors and admins.
function dashboardPath(role: Exclude<Me["role"], null>): string {
  switch (role) {
    case "ATHLETE":
      return "/dashboard/athlete";
    case "SPONSOR":
      return "/dashboard/sponsor";
    case "COORDINATOR":
      return "/dashboard/coordinator";
    case "SUPPLIER":
      return "/dashboard/supplier";
    case "ADMIN":
      return "/admin";
  }
}

export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== null) redirect(dashboardPath(me.role));

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
