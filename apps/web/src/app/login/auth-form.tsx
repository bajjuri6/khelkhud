"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { loginSchema, registerSchema } from "@khelkhud/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

/**
 * Email + password, with Google alongside rather than above it.
 *
 * One component for both modes: the fields differ by exactly one input, and two separate
 * pages would drift apart and double the places a validation message has to be fixed.
 *
 * Validation runs client-side against the SAME zod schemas the API uses
 * (@khelkhud/shared), so the rules cannot disagree. The server still validates — this is
 * only here to avoid a round trip to be told a password is too short.
 */
export function AuthForm({ googleHref, next }: { googleHref: string; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isSignup = mode === "signup";

  function switchMode(to: Mode) {
    setMode(to);
    setErrors({}); // stale errors from the other mode are just confusing
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});

    const form = new FormData(e.currentTarget);
    const raw = {
      ...(isSignup ? { name: String(form.get("name") ?? "") } : {}),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const schema = isSignup ? registerSchema : loginSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setPending(true);
    try {
      const res = await apiClient<{ data: { redirect: string } }>(
        isSignup ? "/api/auth/register" : "/api/auth/login",
        { method: "POST", body: JSON.stringify(parsed.data) },
      );
      // The API decides where to land: /onboarding when no role is set yet, otherwise the
      // right dashboard. `next` only wins when it is a same-site path.
      const dest = next?.startsWith("/") ? next : res.data.redirect;
      // refresh() so the server-rendered layout picks up the new session cookie; without
      // it the header renders signed-out until a hard reload.
      router.push(dest);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        // USE_GOOGLE is the one case worth steering rather than just reporting: the
        // account exists but was created through Google and has no password.
        if (err.code === "USE_GOOGLE") {
          setErrors({ email: err.message });
        } else if (err.code === "EMAIL_TAKEN") {
          setErrors({ email: err.message });
          switchMode("signin");
        } else {
          setErrors({ form: err.message });
        }
      } else {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {/* Mode switch. Two buttons rather than a link, so the form state survives. */}
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-cream-2 p-1"
      >
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === m
                ? "bg-card text-foreground shadow-lift"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {isSignup ? (
          <Field id="name" label="Your name" error={errors.name}>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Sai Kumar"
              className="h-11"
              aria-invalid={Boolean(errors.name)}
              required
            />
          </Field>
        ) : null}

        <Field id="email" label="Email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-11"
            aria-invalid={Boolean(errors.email)}
            required
          />
        </Field>

        <Field
          id="password"
          label="Password"
          error={errors.password}
          hint={isSignup ? "At least 10 characters." : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            // The correct autocomplete token matters: `new-password` is what prompts a
            // password manager to offer to generate and save one.
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="h-11"
            aria-invalid={Boolean(errors.password)}
            required
          />
        </Field>

        {errors.form ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errors.form}
          </p>
        ) : null}

        <Button type="submit" size="hero" variant="accent" className="w-full" disabled={pending}>
          {pending
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-sweat">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* A plain <a>, not the router: this leaves the SPA for the OAuth redirect. */}
      <Button asChild size="hero" variant="onLight" className="w-full border">
        <a href={googleHref}>
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.9.55 3.95 1.5l2.2-2.2A9 9 0 1 0 12 21c5.2 0 8.85-3.65 8.85-8.85 0-.35-.03-.7-.1-1.05Z"
            />
          </svg>
          Continue with Google
        </a>
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-sweat">{hint}</p>
      ) : null}
    </div>
  );
}
