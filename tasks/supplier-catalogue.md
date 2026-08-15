# Supplier catalogue

Step 4 of `docs/architecture/v2-village-model.md` §8. Steps 1–3 are built and deployed
(0.3.1). This is the last piece before the equipment track can exist at all.

## 1. Why this exists

The equipment track's whole premise (§4, "Why donors buy directly") is that khelkhud never
holds the money or the goods. A donor in New Jersey reads "cricket bat, size 6" and buys it
on Amazon themselves. That keeps us a broker rather than a purchasing operation, and the
spec is honest about the cost:

> khelkhud can prove an item was *delivered*, not that it was *bought at a fair price*.
> The catalogue's indicative price is the guard against overpaying, not a guarantee.

So the catalogue is not a shop. It is **the vocabulary the two ends of the transaction
share**, and it carries exactly three jobs:

1. **Name things precisely enough to buy them.** "Bat" is unbuyable. "Cricket bat, English
   willow, size 6, short handle" is. A coordinator in Ammapur and a donor in New Jersey
   must be able to mean the same object.
2. **Anchor the price.** `indicativePaise` is what tells a donor that ₹18,000 for that bat
   is wrong. Without it the donor has no defence and the athlete has no recourse.
3. **Shorten the path to purchase.** A working link into Amazon/Flipkart/Meesho, or to a
   supplier who will sell direct.

Everything below follows from those three. Anything that does not serve them is not in
scope.

## 2. Grounding — three places the built code diverges from the spec sketch

The §5 Prisma sketch was written before steps 1–3 landed. Verified against the schema as
built:

**a. `Contribution` was never built, and should not be.** The sketch generalises
`Sponsorship` into `Contribution { kind: EQUIPMENT | CASH }`. What actually shipped keeps
`Sponsorship` and hangs `requestId` off it. Looking at the model, that was right:
`Sponsorship` is cash to its bones — `razorpayOrderId`, `razorpayPaymentId`,
`paymentStatus`, `utilizationStatus`, `allocations`, `transactions`. An equipment pledge
has none of them: no money moves through us, there is nothing to allocate, and the proof
is a photograph rather than a receipt.

Merging them produces a table where half the columns are permanently null and every query
carries a `kind` guard. **Decision: `EquipmentPledge` links `SponsorProfile` →
`RequestItem` directly.** The two tracks stay separate all the way down and only converge
at the `Request`, which is exactly where §4's diagram converges them.

**b. `RequestItem` has no `equipmentItemId`.** The sketch has it; the built model does not
(it is `label` + `estimatedPaise` only, which is all the cash track needed). Wave 0 adds
it, **nullable** — a cash line item ("Travel to Nationals, Ranchi") will never point at a
catalogue entry, and an equipment request for something genuinely not in the catalogue
must still be raisable rather than blocked on an admin adding a row.

**c. No supplier scaffolding exists.** `Role.SUPPLIER` is in the enum and `dashboardPath`
sends them to `/` (added when onboarding was fixed). There is no `SupplierProfile`, no
supplier surface, and nothing grants the permission §9.4 refers to.

## 3. Domain model

```prisma
model SupplierProfile {
  id           String  @id @default(cuid())
  userId       String  @unique
  name         String                    // "Sachdev Sports, Secunderabad"
  website      String?
  gstin        String?
  /// The §9.4 grant. FALSE by default: a SUPPLIER account can exist and see its own
  /// catalogue while an admin decides whether to trust it in front of donors.
  canPublish   Boolean @default(false)
  approvedById String?
  approvedAt   DateTime?
  isActive     Boolean @default(true)
}

model EquipmentItem {                    // the canonical vocabulary
  id              String  @id @default(cuid())
  slug            String  @unique        // stable key for imports; dedupe target
  name            String                 // "Cricket bat, English willow, size 6"
  sportId         String?
  category        EquipmentCategory
  spec            String?                // free text: size, weight, material
  indicativePaise Int                    // ADMIN-owned. The overpaying guard.
  isActive        Boolean @default(true)
  offers          SupplierOffer[]
}

model SupplierOffer {
  id              String   @id @default(cuid())
  supplierId      String?                // null = admin-curated marketplace link
  equipmentItemId String
  marketplace     Marketplace            // AMAZON | FLIPKART | MEESHO | DIRECT
  url             String
  pricePaise      Int
  /// Links and prices rot. Surfaced in the UI rather than trusted.
  checkedAt       DateTime @default(now())
  isActive        Boolean  @default(true)
}

enum EquipmentCategory { BAT BALL SHOE KIT PROTECTIVE MAT NET APPAREL TRAINING OTHER }
enum Marketplace { AMAZON FLIPKART MEESHO DIRECT }
```

Plus, on the existing model:

```prisma
model RequestItem {
  equipmentItemId String?               // NEW, nullable — see §2b
}
```

### Slug is the import key

Bulk import needs an idempotent dedupe target, and `name` is not one — "Cricket bat size
6" and "Cricket Bat, Size 6" are the same object. `slug` is generated from
`sport-category-name`, normalised, and is what a re-import matches on. Re-running the same
sheet updates rather than duplicating. This is the single most important property of the
importer: an admin *will* re-upload a corrected sheet.

## 4. Permission model

One rule, enforced in one place, mirroring `assertCoordinatorCovers`:

| Actor | Own offers | Others' offers | `EquipmentItem` | `indicativePaise` |
|---|---|---|---|---|
| `SUPPLIER`, `canPublish=false` | draft only, not public | — | — | — |
| `SUPPLIER`, `canPublish=true` | CRUD, live | — | propose | — |
| `ADMIN` | CRUD any | CRUD any | CRUD | CRUD |

**A supplier never sets `indicativePaise`.** It is the guard *against* the seller; letting
sellers set it inverts the control. Suppliers set their own `pricePaise`; admins set what
the thing should cost.

**Suppliers do not create `EquipmentItem` rows freely.** Otherwise the vocabulary
fragments into "Cricket Bat (Sachdev)" vs "Cricket bat, size 6" and the shared-vocabulary
job in §1.1 fails. They propose; an admin merges. At pilot volume this is a handful of
rows a week.

`assertSupplierCanPublish(userId)` is the chokepoint. Out-of-scope and non-existent return
the same 403, as with coordinators, so the API cannot be used to enumerate.

## 5. Import pipeline

§9.4 asks for three entry points. They must share **one validator** — three parsers that
drift is how a bulk import silently writes different data than the form.

```
        .xlsx / .csv
              │
      ┌───────▼────────┐
      │ parseCatalogue │  exceljs -> rows
      └───────┬────────┘
      ┌───────▼────────┐
      │ validateRows   │  zod, per row, collects ALL errors with row numbers
      └───────┬────────┘
        ┌─────┴─────┐
   CLI script   admin upload      -> same importCatalogue(rows, { dryRun })
```

- **Dry run is the default** everywhere. It reports what would be created, updated and
  skipped, and nothing is written until the operator confirms. An import that silently
  half-applies is worse than one that refuses.
- **Errors are collected, not thrown on first.** Row 4 being wrong must not hide row 90.
  Output is a table of `row | column | value | why`.
- **Partial success is allowed but explicit.** Valid rows can commit while invalid ones are
  reported — but only when the operator passes `--allow-partial`. Default is all-or-nothing.
- `exceljs` for parsing (maintained; `xlsx`/SheetJS has a stale npm build and CVE history).
  ~1MB — the api image is 128MB, so this is affordable.

A template `.xlsx` is generated by the same code that validates it, so the two cannot
disagree.

## 6. Surfaces

| Route | Who | What |
|---|---|---|
| `GET /api/catalogue` | public | browse/search; powers the request-form picker |
| `GET /api/catalogue/:id` | public | item + live offers, cheapest first, staleness flagged |
| `POST/PATCH /api/admin/catalogue` | admin | curate items, set indicative price |
| `POST /api/admin/catalogue/import` | admin | upload, dry-run, confirm |
| `GET/POST/PATCH /api/suppliers/me/offers` | supplier | own offers only |
| `POST /api/admin/suppliers/:id/approve` | admin | the `canPublish` grant |
| `/admin/catalogue` | admin | curation + import UI |
| `/dashboard/supplier` | supplier | own catalogue, approval state |
| `/equipment` | public | browsable catalogue — also an SEO surface |

### Staleness, honestly

`checkedAt` is shown as "price checked 40 days ago", and offers older than 90 days are
sorted last and visually de-emphasised. We do not scrape marketplaces to refresh — that is
brittle and adversarial. The honest move is to show the age and let the donor judge, which
matches §4's "indicative price is the guard, not a guarantee".

## 7. Waves

Wave 0 is single-threaded because everything imports from it. Within a wave, lanes touch
disjoint files.

**Wave 0 — foundation (me, blocking, ~1 commit)**
- `schema.prisma`: `SupplierProfile`, `EquipmentItem`, `SupplierOffer`, two enums,
  `RequestItem.equipmentItemId`; one migration.
- `packages/shared/src/schemas/catalogue.ts` + `supplier.ts`; export from index.
- `apps/api/src/services/supplier.service.ts`: `assertSupplierCanPublish`.
- Seed ~40 real items across cricket/kabaddi/athletics/volleyball with honest prices.

**Wave 1 — three lanes, parallel**

| Lane | Scope | Files |
|---|---|---|
| A | Catalogue API | `routes/catalogue.ts`, `routes/suppliers.ts`, mount in `index.ts` |
| B | Import pipeline | `services/catalogue-import.ts`, `scripts/import-catalogue.ts`, admin import route |
| C | Admin catalogue UI | `app/admin/catalogue/**` + one NAV line |

Lane B writes the admin import *route* inside its own file and Lane A mounts a router it
does not edit — the only shared file is `index.ts`, which I take.

**Wave 2 — two lanes, parallel (needs Wave 1A)**

| Lane | Scope | Files |
|---|---|---|
| D | Supplier self-serve | `app/dashboard/supplier/**`, supplier approval in `app/admin/suppliers/**` |
| E | Catalogue picker in the request form | `components/equipment-picker.tsx`, athlete + coordinator request forms |

**Wave 3 — public `/equipment` browse + SEO** (needs 1A). Sequential, small.

Then steps 5 (pledges, delivery confirmation) and 6 (`SponsorVillage` fan-out) — separate
tasks, not this one.

## 8. Definition of done

- An admin can add an item by hand, bulk-import a sheet, re-import the corrected sheet
  without duplicating, and see exactly what changed before committing.
- A supplier can register, sit unapproved without leaking into public view, be approved,
  and CRUD only their own offers.
- A coordinator raising an equipment request can pick from the catalogue, and the item
  carries the indicative price into `RequestItem`.
- The public catalogue shows offers cheapest-first with visible staleness.
- `pnpm smoke` covers: import idempotency, the `canPublish` gate, and that a supplier
  cannot touch another's offers or set `indicativePaise`.

## 9. Decisions — settled 2026-08-15

1. **Direct fulfilment: no, links only.** Suppliers publish offers with URLs; the donor
   always buys externally. khelkhud stays a broker and never touches the transaction,
   consistent with §4 and with decision §9.1 of the v2 spec (one custody path). A supplier
   who wants to sell direct uses `Marketplace.DIRECT` with a link to their own storefront —
   no order state, no obligation modelled here.

2. **Over-price: show it, flagged, sorted last.** An offer above `indicativePaise` stays
   visible, is marked as above the expected price, and ranks below cheaper ones. Hiding it
   would be a silent judgement made on a number an admin may simply have set wrong, and an
   admin review queue is a queue someone has to actually work. Showing the guard next to
   the price is what §4 already promises. Threshold for the flag: **> 1.25×** indicative,
   in one constant, so it is one edit to tune.
