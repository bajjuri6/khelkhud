# khelkhud v2 — the village model

**Status:** proposed, not implemented. Supersedes the athlete-and-sponsor model currently
deployed at khelo.kautilya.app.

---

## 1. What actually changed

v1 assumed one shape: *a verified athlete asks for money, a sponsor pays, receipts prove
where it went.* That is now **one of two tracks**, and the smaller one.

The new understanding:

- The unit of community is the **village**, not the athlete. Donors are its diaspora —
  people who left and want to give back to a specific place. Their affiliation is to the
  village first and whoever needs help there second.
- Most needs are **equipment, not cash**. A school needs mats. A playground needs posts. A
  promising kabaddi player needs proper shoes. These are things you buy, not sums you
  transfer.
- Beneficiaries are often **institutions**, not people — a government school, a community
  ground, a club. v1 has no way to express "the village needs this".
- Cash is the exception: travel, coaching, entry fees. Those still need the v1 flow.

The single most important consequence:

> **The equipment track never touches khelkhud's money.** The donor buys from Amazon,
> Flipkart, Meesho or a supplier directly, and has it shipped to the coordinator or the
> athlete. khelkhud brokers and verifies; it does not take custody of funds.

That removes payment custody, refunds, escrow and settlement from the biggest half of the
product. It also changes what "transparency" means on that track: not *here is the receipt
for what we spent*, but *here is proof it arrived*.

---

## 2. Stakeholders

| Role | Who | Can do |
|---|---|---|
| `ATHLETE` | An individual competitor | Build a profile, raise requests for themselves |
| `COORDINATOR` | PET teacher, sarpanch, or another publicly visible villager | Validate requests in their village; raise requests for athletes or institutions; confirm deliveries |
| `SPONSOR` | Usually a descendant of the village ("donor" in prose); also companies/CSR | Register interest in villages, fund cash requests, pledge and buy equipment |
| `SUPPLIER` | Reebok, Decathlon, Sachdev Sports, local distributors | Maintain catalogue entries, prices, purchase links; optionally fulfil directly |
| `ADMIN` | khelkhud staff | Appoint coordinators, curate the catalogue, override anything |

**Naming (settled).** `PLAYER` -> `ATHLETE`. `SPONSOR` keeps its name — "donor" is how we
talk about them, not what the role is called. Renaming is wide but shallow, and with no
real users yet this is the cheapest it will ever be.

### The coordinator is the trust anchor

This is the load-bearing idea. v1 centralises verification with an admin, which does not
scale to 10,000 villages and cannot judge whether a claimed district medal is real. A PET
teacher or sarpanch can, and is accountable locally in a way a remote reviewer is not.

So: **a request raised by the village's own coordinator is validated on arrival**, because
the coordinator *is* the validator. There is no second queue. Every such action is written
to `VerificationRecord` naming the coordinator, and an admin can revoke — speed by default,
accountability retained.

A request raised by an athlete goes to their village coordinator, not to an admin.

---

## 3. Village identity

Everything hangs off getting the village right. "Kondapur" is a village in Sangareddy, a
village in Medak, and a neighbourhood in Hyderabad. Free-text village names would fragment
donors away from the places they are looking for — the single highest-value thing in the
product.

**Resolution: PIN code narrows, fuzzy match disambiguates, human confirms.**

1. User types a village name and a 6-digit PIN.
2. The PIN narrows a canonical village table to a handful of candidates (a PIN covers a
   post office's delivery area — typically 1–15 villages).
3. Rank candidates by trigram similarity against the typed name, with transliteration
   tolerance so *Cheruvu / Cheruvvu / Cheruv* converge.
4. Show ranked matches; the user picks. Never silently auto-assign.
5. Store the resolved `villageId` **and** the raw input, so bad matches are diagnosable.

The database already has what this needs — verified present on the managed server:

```
pg_trgm 1.6        trigram similarity + GIN index
fuzzystrmatch 1.2  dmetaphone, for transliteration variants
unaccent 1.1       diacritic folding
```

Canonical source: the **LGD (Local Government Directory)** village codes, which are the
government's own identifiers, cross-referenced with India Post PIN data. LGD codes matter
because they survive renames and let khelkhud reconcile with official schemes later.

**Aliases are first-class.** Villages genuinely have several spellings and often an older
name. An `aliases` array on the village row, included in the match, is what stops the same
place being created twice.

### One tree, not two

v1's `Location` is a self-referential tree (`STATE → DISTRICT → CITY`). Rather than adding
a parallel `Village` table, extend it: add `MANDAL` and `VILLAGE` levels, plus `pincode`,
`lgdCode`, `aliases[]`, and a denormalised `displayPath` ("Ammapur, Sangareddy Mandal,
Sangareddy, Telangana") so a village can be rendered without four joins.

---

## 4. The two tracks

```
                      ┌──────────────── REQUEST ────────────────┐
                      │  village · beneficiary · raised by      │
                      └────────────────┬────────────────────────┘
                    kind=EQUIPMENT     │      kind=CASH
              ┌──────────────────────┐ │ ┌──────────────────────────┐
              │ items -> catalogue   │ │ │ line items -> amounts    │
              │ indicative price     │ │ │ total in paise           │
              └──────────┬───────────┘ │ └────────────┬─────────────┘
                         │             │              │
              donor PLEDGES an item    │      donor PAYS via Razorpay
                         │             │              │
              buys on Amazon/Flipkart  │      funds reach the athlete
              /Meesho/supplier direct  │              │
                         │             │      athlete spends, uploads
              ships to coordinator     │      receipt per allocation
              or athlete               │              │
                         │             │              │
              coordinator CONFIRMS     │      sponsor sees receipts
              delivery + photo proof   │              │
                         └─────────────┴──────────────┘
                                  update posted
```

**Equipment** proves itself with delivery confirmation and a photograph. **Cash** proves
itself with receipts, exactly as v1 does today. Both end in an update from the ground.

### Why donors buy directly

The alternative — donor pays khelkhud, khelkhud procures — means holding other people's
money, reconciling it, and running a purchasing operation. It also makes khelkhud liable
for delivery. Direct purchase keeps the platform a broker, which is what it is good at.

The cost is honest and should be stated in the UI: khelkhud can prove an item was
*delivered*, not that it was *bought at a fair price*. The catalogue's indicative price is
the guard against overpaying, not a guarantee.

---

## 5. Domain model

New and changed entities. Prisma sketch, not final.

```prisma
enum Role { ATHLETE COORDINATOR SPONSOR SUPPLIER ADMIN }

enum LocationLevel { STATE DISTRICT MANDAL VILLAGE }

model Location {                       // extended, not replaced
  lgdCode     String?  @unique         // government identifier, survives renames
  pincode     String?                  // indexed; the narrowing key
  aliases     String[] @default([])    // alternate spellings, matched alongside `name`
  displayPath String?                  // "Ammapur, Sangareddy Mandal, Sangareddy, Telangana"
  // ... existing tree fields
}

model CoordinatorProfile {
  userId      String   @unique
  villages    Location[]               // one person often covers several small villages
  role        String                   // "PET teacher, ZPHS Ammapur" — shown to donors
  appointedBy String                   // admin user id; this is a trust delegation
  isActive    Boolean  @default(true)
}

model Institution {                    // the beneficiary v1 cannot express
  villageId   String
  kind        InstitutionKind          // SCHOOL | PLAYGROUND | CLUB | ANGANWADI
  name        String
  custodianId String?                  // usually the coordinator
}

model Request {                        // generalises SponsorshipRequirement
  kind           RequestKind           // EQUIPMENT | CASH
  villageId      String                // denormalised: drives donor notification fan-out
  athleteId      String?               // exactly one beneficiary
  institutionId  String?
  raisedById     String
  status         RequestStatus         // DRAFT PENDING_VALIDATION OPEN PARTIALLY_FULFILLED FULFILLED CLOSED
  validatedById  String?               // the coordinator; set immediately when they raised it
  validatedAt    DateTime?
  items          RequestItem[]
}

model RequestItem {
  requestId        String
  equipmentItemId  String?             // EQUIPMENT: points at the catalogue
  quantity         Int      @default(1)
  label            String              // CASH: "Travel to Nationals, Ranchi"
  estimatedPaise   Int
  fulfilledQty     Int      @default(0)
}

model EquipmentItem {                  // the canonical catalogue
  name           String                // "Cricket bat, English willow, size 6"
  sportId        String?
  category       String                // BAT | SHOE | MAT | NET | BALL | KIT | PROTECTIVE
  indicativePaise Int                  // what a donor should expect to pay
  offers         SupplierOffer[]
}

model SupplierOffer {
  supplierId      String?              // null = an admin-curated marketplace link
  equipmentItemId String
  marketplace     Marketplace          // AMAZON | FLIPKART | MEESHO | DIRECT
  url             String
  pricePaise      Int
  checkedAt       DateTime             // links and prices rot; surface staleness
}

model Contribution {                   // generalises Sponsorship
  kind        ContributionKind         // EQUIPMENT | CASH
  sponsorId   String
  requestId   String
  // CASH: amountPaise + razorpay ids + allocations (all unchanged from v1)
  // EQUIPMENT:
  pledges     EquipmentPledge[]
}

model EquipmentPledge {
  requestItemId String
  quantity      Int
  marketplace   Marketplace
  orderRef      String?                // donor-supplied, not verified
  status        PledgeStatus           // PLEDGED ORDERED SHIPPED DELIVERED CONFIRMED CANCELLED
  deliverTo     DeliveryTarget         // COORDINATOR | ATHLETE
  confirmedById String?                // coordinator who confirmed
  proofDocId    String?                // delivery photograph
}

model SponsorVillage {                 // "notify me about my village"
  sponsorId String
  villageId String
  notify    Boolean @default(true)
  @@unique([sponsorId, villageId])
}
```

`PledgeStatus` deliberately separates `DELIVERED` (donor/courier says so) from `CONFIRMED`
(the coordinator saw it). Only the second one counts, for the same reason a receipt counts
and an invoice does not.

---

## 6. Notification fan-out

The product's engine: a request is raised in Ammapur → every sponsor with a `SponsorVillage`
row for Ammapur is notified. That single loop is what makes diaspora giving work, and it
is why `villageId` is denormalised onto `Request`.

Volume is low enough that a synchronous fan-out on write is fine at launch; it needs a
queue only when a village has thousands of watchers, which is a good problem.

New notification types: `REQUEST_RAISED_IN_VILLAGE`, `REQUEST_VALIDATED`,
`PLEDGE_RECEIVED`, `DELIVERY_CONFIRMED`, `COORDINATOR_ACTION_REQUIRED`.

---

## 7. What this means for what is already built

**Reused unchanged:** auth (both paths), notifications, documents/uploads, Razorpay, the
verification-record pattern, the whole First Light design system, all devops.

**Generalised:** `SponsorshipRequirement` → `Request`; `Sponsorship` → `Contribution`;
`SponsorshipAllocation` stays as the cash-track detail.

**New:** `Institution`, `CoordinatorProfile`, `EquipmentItem`, `SupplierOffer`,
`EquipmentPledge`, `SponsorVillage`, village resolution.

**Invalidated content.** The landing page and FAQ I shipped today argue a single thesis:
*sponsor an athlete, follow the rupee*. That is now half the story and the smaller half.
The hero illustration survives — a barefoot batter with a taped plank is, if anything, a
better argument for the equipment track. The copy and the FAQ need rewriting around
village + equipment. The `improvised-kit` annotated image becomes *more* apt: it is
literally a catalogue with prices.

---

## 8. Suggested sequencing

Each step leaves the app working.

1. **Village identity** — extend `Location`, seed Telangana villages with LGD + PIN,
   enable `pg_trgm`, build the resolver endpoint and picker UI. Nothing depends on the rest.
2. **Roles + coordinator** — add roles, `CoordinatorProfile`, auto-validation, admin
   appointment screen. Rename `PLAYER`→`ATHLETE` here (one migration, one refactor,
   while the surface area is smallest).
3. **Generalise requests** — `SponsorshipRequirement` → `Request` + `RequestItem`, add
   `Institution`. Cash track keeps working throughout.
4. **Catalogue** — `EquipmentItem`, `SupplierOffer`, admin curation, supplier onboarding.
5. **Equipment track** — pledges, order references, delivery confirmation with photo proof.
6. **Donor village interest + fan-out** — the notification loop.
7. **Rewrite the public copy** around both tracks.

Steps 1–3 are the migration-heavy ones and are worth doing together to avoid three
schema churns.

---

## 9. Decisions — settled 2026-08-13

1. **Cash toward an equipment request:** NO at launch. One custody path. Revisit only if
   real donors ask for it.
2. **Village dataset:** authoritative offline table, not a live Maps API. Evidence in §10.
3. **Renaming:** `PLAYER` -> `ATHLETE`. `SPONSOR` stays `SPONSOR` (the doc's earlier
   "donor" language is prose, not the role name).
4. **Catalogue:** suppliers CRUD their own entries once an ADMIN grants them permission.
   ADMIN can also act on a supplier's behalf, by manual entry or bulk Excel import, plus a
   local validating import script.
5. **Scope:** Telangana first, all of India after. *"A sporting nation is a healthy
   nation."* Sarvejana Foundation remains the backing organisation.

---

## 10. Why not Google Maps or OpenStreetMap as the source of truth

The question was reasonable: mapping platforms should have good village data by 2026. They
largely do. The problem is not recency — it is **authority, licensing and coupling**.

Measured on 2026-08-13:

| Check | Result |
|---|---|
| OSM `place=village` nodes in Telangana (Overpass) | **8,939** |
| Revenue villages in Telangana per LGD/Census | **~10,400** |
| Nominatim search "Ammapur Sangareddy Telangana" | **0 results** |
| Nominatim search "Pochampally Telangana" | **4 results** — the ambiguity is real |

So OSM covers roughly 85% of Telangana's villages. The missing ~15% is not an abstraction:
it is athletes who could not register at all, concentrated in exactly the small and remote
places this product exists for.

Beyond coverage:

- **No PIN linkage.** OSM village nodes frequently carry no postcode. The entire
  disambiguation strategy is *PIN narrows, fuzzy ranks* — without the PIN it collapses.
- **No stable government identifier.** LGD codes survive renames and are what lets
  khelkhud reconcile with official schemes, grants and district sports authorities later.
  A mapping node id does not.
- **Google Places forbids it.** The Places ToS permits caching `place_id` but not building
  a derived database from the returned data. Using it means being API-dependent forever:
  per-request cost, and a Places outage means nobody can register.
- **Nominatim's public API is 1 req/sec and explicitly not for bulk use.** Production means
  self-hosting an OSM stack — vastly more operational weight than one table.
- **Availability coupling.** The most important identity in the product would depend on a
  third-party call, for data that changes about once a year.

**Decision.** A canonical `Location` table seeded from **LGD village codes cross-referenced
with India Post PIN data** — free to store, complete by definition, government-anchored,
and queryable in about a millisecond with `pg_trgm`.

Maps stay useful for one thing: optional lat/lng so a village can be shown on a map. That
is enrichment, not identity.

**The gap that matters.** No dataset is perfect, and a missing village must never block a
real athlete. A coordinator or admin can add a village with its PIN; it is created flagged
`unverified` and queued for reconciliation against LGD. The resolver prefers canonical rows
and only offers the flagged one when nothing else matches.

---

## 11. Superseded

The questions below were the original open list. All are answered in §9; they are kept
only so the reasoning behind each decision is still readable.

1. **Village dataset.** LGD codes are the right anchor but need sourcing. Telangana alone
   is ~10,000 villages. Is there an existing dataset, or should this start with the
   districts you are actually piloting?
2. **Renaming.** `PLAYER`→`ATHLETE`, `SPONSOR`→`DONOR`: worth doing now, or leave the
   internal names and only change the UI labels?
3. **Can a donor give cash toward an equipment request?** Someone who wants to help but
   will not navigate Flipkart. This reintroduces custody and is the single biggest scope
   question in the design. Recommendation: no at launch — let the coordinator raise a cash
   request instead, which keeps one custody path rather than two.
4. **Who curates the catalogue at launch?** Supplier self-service needs supplier
   onboarding; admin curation is faster to ship and better quality. Recommendation: admin
   curated, supplier-submitted later.
5. **Geographic scope.** Telangana only, as now? The village resolver's dataset size and
   the notification model both depend on the answer.
