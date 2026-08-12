import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">404</h1>
      <p className="mt-2 text-muted-foreground">This page doesn&apos;t exist or was moved.</p>
      <Button asChild className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
