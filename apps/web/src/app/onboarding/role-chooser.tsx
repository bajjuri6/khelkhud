"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SelfSelectableRole } from "@khelkhud/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

// Only the two self-selectable roles, matching roleSelectSchema. Coordinators and
// suppliers are appointed by an admin and never appear as a button here.
const ROLES: { role: SelfSelectableRole; title: string; description: string; cta: string }[] = [
  {
    role: "ATHLETE",
    title: "I'm an Athlete",
    description:
      "Build your sports profile and ask for what you actually need — equipment and kit, or costs like travel, coaching and entry fees.",
    cta: "Create athlete profile",
  },
  {
    role: "SPONSOR",
    title: "I'm a Sponsor",
    description:
      "Support athletes and villages in Telangana. Pick one specific request, cover it, and see exactly where it went.",
    cta: "Start sponsoring",
  },
];

export function RoleChooser() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<SelfSelectableRole | null>(null);

  async function choose(role: SelfSelectableRole) {
    setSubmitting(role);
    try {
      const res = await apiClient<{ data: { redirect: string } }>("/api/auth/role", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      router.push(res.data.redirect);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set role");
      setSubmitting(null);
    }
  }

  return (
    <>
      <div className="mt-10 grid w-full gap-6 sm:grid-cols-2">
        {ROLES.map(({ role, title, description, cta }) => (
          <Card key={role} className="flex flex-col">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                className="w-full"
                disabled={submitting !== null}
                onClick={() => void choose(role)}
              >
                {submitting === role ? "Setting up…" : cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 w-full rounded-lg border border-border bg-cream-2 px-5 py-4 text-left">
        <p className="eyebrow text-slate">Coordinator or supplier?</p>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          Those two are assigned by khelkhud, not chosen here &mdash; a coordinator vouches for
          their village, and a supplier is cleared before listing anything. If you have been
          told you&rsquo;ll be one, sign in with the email khelkhud has on file and it will
          already be set. If it isn&rsquo;t, ask whoever invited you to sort it out first &mdash;
          the choice above is one-time.
        </p>
      </div>
    </>
  );
}
