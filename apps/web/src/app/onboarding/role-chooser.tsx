"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

const ROLES = [
  {
    role: "ATHLETE" as const,
    title: "I'm an Athlete",
    description:
      "Create your sports profile, list what you need, and receive transparent sponsorships.",
    cta: "Create athlete profile",
  },
  {
    role: "SPONSOR" as const,
    title: "I'm a Sponsor",
    description:
      "Discover promising local athletes, support them, and track exactly how your money helps.",
    cta: "Start sponsoring",
  },
];

export function RoleChooser() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"ATHLETE" | "SPONSOR" | null>(null);

  async function choose(role: "ATHLETE" | "SPONSOR") {
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
  );
}
