"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">
        An unexpected error occurred. Please try again.
      </p>
      <Button className="mt-6" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
