import type { Metadata } from "next";
import { apiServer, getMe } from "@/lib/api-server";
import { SupplierManager, type SupplierMe } from "./supplier-manager";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDashboardPage() {
  const [me, res] = await Promise.all([
    getMe(),
    // Null here means one of three things, and they collapse because apiServer maps every
    // failure to null: no SupplierProfile yet (403 NOT_A_SUPPLIER), a deactivated supplier
    // (the same 403), or the API being briefly unreachable. The registration form is the
    // right landing for the first; the other two hit a 409 from /register that says
    // plainly what happened, which beats guessing here and guessing wrong.
    apiServer<{ data: SupplierMe }>("/api/suppliers/me"),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow text-muted-foreground">Supplier</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {res?.data.name ?? "Sell to khelkhud's athletes"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          khelkhud never holds the money or the goods. A donor reads &ldquo;cricket bat,
          English willow, size 6&rdquo;, sees what it should cost, and buys it from a link —
          yours, or a marketplace&rsquo;s. Your job here is one thing: a working link and an
          honest price against a catalogue item, kept current.
        </p>
      </div>

      <SupplierManager profile={res?.data ?? null} viewerRole={me?.role ?? null} />
    </div>
  );
}
