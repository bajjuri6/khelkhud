import type { Metadata } from "next";
import { StatTile } from "@/components/stat-tile";
import { apiServer } from "@/lib/api-server";
import { SuppliersManager, type AdminSupplier } from "./suppliers-manager";

export const metadata: Metadata = { title: "Suppliers" };

export default async function AdminSuppliersPage() {
  const res = await apiServer<{ data: AdminSupplier[] }>("/api/admin/suppliers");
  if (!res) return <p className="text-muted-foreground">Could not load suppliers.</p>;

  const suppliers = res.data;
  const waiting = suppliers.filter((s) => !s.canPublish && s.isActive);
  const publishing = suppliers.filter((s) => s.canPublish && s.isActive);
  // Counted across everyone, not just the waiting list: a wound-down supplier's live offers
  // are just as invisible, and this figure is meant to be "what a donor cannot see".
  const hidden = suppliers.reduce((n, s) => n + s.hiddenOfferCount, 0);

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow text-muted-foreground">Who gets to sell in front of a donor</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Suppliers</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          khelkhud never holds the money or the goods — a donor reads &ldquo;cricket bat,
          size 6&rdquo; and buys it themselves, from a link. Approving a supplier is what
          puts their links in that position. We can prove an item was delivered; we cannot
          prove it was bought at a fair price, so the catalogue&rsquo;s indicative price and
          this decision are the only two guards a donor has. Registering is self-serve and
          grants nothing: nothing a supplier writes reaches a donor until someone here says
          so, and withdrawing that hides it all again without deleting a thing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Waiting on you"
          value={String(waiting.length)}
          hint={
            waiting.length === 0
              ? "Nobody is stuck behind an approval."
              : "Registered, unapproved, invisible to every donor."
          }
        />
        <StatTile
          label="Publishing"
          value={String(publishing.length)}
          hint="Their links are live in front of donors."
        />
        <StatTile
          label="Offers donors cannot see"
          value={String(hidden)}
          hint="Live offers suppressed by an approval or an inactive supplier."
        />
      </div>

      <SuppliersManager suppliers={suppliers} />
    </div>
  );
}
