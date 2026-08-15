import { readFileSync } from "node:fs";
import { equipmentSlug } from "@khelkhud/shared";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PrismaClient,
  LocationLevel,
  LocationSource,
  InstitutionKind,
  RequestKind,
  RequestStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Seed for the v2 village model (docs/architecture/v2-village-model.md).
 *
 *   pnpm db:seed                  everything, including demo people
 *   SEED_DEMO=false pnpm db:seed  reference data only — sports, locations, admins
 *
 * Reference data is REAL. The 1,069 locations come from India Post's live directory for
 * the pilot districts, fetched rather than invented, and carry source=INDIA_POST with
 * isVerified=false because a branch post office is a good proxy for a village but is not
 * an LGD record. No LGD codes are fabricated; that field stays null until reconciled.
 *
 * Demo people are obviously fictional and gated behind SEED_DEMO so production never gets
 * fabricated athletes on a page whose whole argument is that these are real, verified people.
 */

const SPORTS = [
  "Cricket", "Football", "Hockey", "Badminton", "Kabaddi", "Athletics",
  "Wrestling", "Boxing", "Table Tennis", "Swimming", "Archery", "Weightlifting",
  "Volleyball",
];

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Compound unique (name, level, parentId) can't drive an upsert when parentId is null —
// Postgres treats NULLs as distinct — so find-or-create.
async function findOrCreateLocation(
  name: string,
  level: LocationLevel,
  parentId: string | null,
  extra: {
    pincode?: string;
    displayPath?: string;
    source?: LocationSource;
    isVerified?: boolean;
  } = {},
) {
  const existing = await prisma.location.findFirst({ where: { name, level, parentId } });
  if (existing) return existing;
  return prisma.location.create({ data: { name, level, parentId, ...extra } });
}

type PostOffice = {
  pincode: string;
  name: string;
  branchType: string;
  mandal: string;
  district: string;
  state: string;
};

/**
 * Build the STATE -> DISTRICT -> MANDAL -> VILLAGE tree from India Post data.
 *
 * A BRANCH post office in rural India is sited in a village and named after it. A SUB or
 * HEAD office is a town. Both are recorded, distinguished by level, because a donor
 * searching "Sangareddy" should find the town too.
 *
 * District names are stored EXACTLY as India Post returns them, which is pre-2016: it
 * still says "Medak" for areas now in Sangareddy and Siddipet. Rewriting government data
 * to match a later reorganisation would be a guess; the current district gets attached as
 * an alias during LGD reconciliation instead.
 */
async function seedPilotLocations(): Promise<number> {
  const raw = readFileSync(path.join(here, "data/pilot-locations.json"), "utf8");
  const offices = JSON.parse(raw) as PostOffice[];

  const stateIds = new Map<string, string>();
  const districtIds = new Map<string, string>();
  const mandalIds = new Map<string, string>();
  let villages = 0;

  for (const o of offices) {
    if (!o.state || !o.district || !o.name) continue;

    let stateId = stateIds.get(o.state);
    if (!stateId) {
      stateId = (await findOrCreateLocation(o.state, LocationLevel.STATE, null, {
        source: LocationSource.INDIA_POST,
        displayPath: o.state,
      })).id;
      stateIds.set(o.state, stateId);
    }

    const dKey = `${o.state}/${o.district}`;
    let districtId = districtIds.get(dKey);
    if (!districtId) {
      districtId = (await findOrCreateLocation(o.district, LocationLevel.DISTRICT, stateId, {
        source: LocationSource.INDIA_POST,
        displayPath: `${o.district}, ${o.state}`,
      })).id;
      districtIds.set(dKey, districtId);
    }

    // India Post returns the literal string "NA" for Block on some records. Taking it at
    // face value creates a mandal named "NA" and a displayPath reading "Venkatapur, NA,
    // Medak" — fall back to the district, which is at least true.
    const rawMandal = (o.mandal || "").trim();
    const mandalName = !rawMandal || rawMandal.toUpperCase() === "NA" ? o.district : rawMandal;
    const mKey = `${dKey}/${mandalName}`;
    let mandalId = mandalIds.get(mKey);
    if (!mandalId) {
      mandalId = (await findOrCreateLocation(mandalName, LocationLevel.MANDAL, districtId, {
        source: LocationSource.INDIA_POST,
        displayPath: `${mandalName}, ${o.district}, ${o.state}`,
      })).id;
      mandalIds.set(mKey, mandalId);
    }

    const isVillage = o.branchType.toLowerCase().startsWith("branch");
    await findOrCreateLocation(
      o.name,
      isVillage ? LocationLevel.VILLAGE : LocationLevel.CITY,
      mandalId,
      {
        pincode: o.pincode,
        displayPath: `${o.name}, ${mandalName}, ${o.district}, ${o.state}`,
        source: LocationSource.INDIA_POST,
        isVerified: false,
      },
    );
    if (isVillage) villages++;
  }

  console.log(
    `Seeded ${stateIds.size} state(s), ${districtIds.size} districts, ` +
      `${mandalIds.size} mandals, ${villages} villages (source: India Post)`,
  );
  return villages;
}

async function main() {
  for (const name of SPORTS) {
    await prisma.sport.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }
  console.log(`Seeded ${SPORTS.length} sports`);

  await seedPilotLocations();
  await seedCatalogue();

  for (const email of ADMIN_EMAILS) {
    await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN" },
      create: { email, name: "Admin", role: "ADMIN" },
    });
    console.log(`Seeded admin: ${email}`);
  }

  if (process.env.SEED_DEMO === "false") {
    console.log("SEED_DEMO=false - skipping demo coordinators, athletes and requests");
    return;
  }
  await seedDemoData();
}

/**
 * The equipment catalogue.
 *
 * Idempotent on `slug`, which is the same key the bulk importer dedupes on — so seeding
 * and importing cannot produce two rows for the same object. Prices are researched Indian
 * retail as of 2026 and deliberately honest: this number is what tells a donor that a
 * quoted price is wrong, so an invented one is worse than none.
 */
function resolveSport(name: string, byName: Map<string, string>): string {
  const id = byName.get(name);
  if (!id) {
    throw new Error(
      `catalogue.json references sport "${name}", which is not in SPORTS. ` +
        `Add it there, or the items silently get sportId=null and vanish from every sport filter.`,
    );
  }
  return id;
}

async function seedCatalogue() {
  const raw = readFileSync(path.join(here, "data/catalogue.json"), "utf8");
  const rows = JSON.parse(raw) as {
    name: string;
    sport?: string;
    category: string;
    spec?: string;
    indicativeRupees: number;
  }[];

  const sports = await prisma.sport.findMany({ select: { id: true, name: true } });
  const sportByName = new Map(sports.map((s) => [s.name, s.id]));

  let created = 0;
  for (const row of rows) {
    const slug = equipmentSlug({ name: row.name, category: row.category, sport: row.sport });
    const data = {
      name: row.name,
      category: row.category as never,
      spec: row.spec ?? null,
      sportId: row.sport ? resolveSport(row.sport, sportByName) : null,
      indicativePaise: Math.round(row.indicativeRupees * 100),
    };
    const res = await prisma.equipmentItem.upsert({
      where: { slug },
      update: data,
      create: { slug, ...data },
    });
    if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
  }
  console.log(`Seeded catalogue: ${rows.length} items (${created} new)`);
}

// ---------- Demo data ----------

const DEMO_COORDINATORS = [
  {
    email: "coord.dubbak@khelkhud.dev",
    name: "Srinivas Rao",
    designation: "PET teacher, ZPHS Dubbak",
    village: "Chikode",
  },
  {
    email: "coord.yellareddy@khelkhud.dev",
    name: "Lakshmi Devi",
    designation: "Sarpanch, Yellareddy",
    village: "Rampur",
  },
];

const DEMO_ATHLETES = [
  {
    email: "athlete.sai@khelkhud.dev",
    name: "Sai Priya",
    sport: "Athletics",
    category: "UNDER_19" as const,
    level: "STATE" as const,
    dob: "2008-06-14",
    verification: "VERIFIED" as const,
    bio: "Middle-distance runner. Trains on the school ground at 5am before class.",
    achievements: [{ title: "District 800m gold", level: "DISTRICT" as const, year: 2025 }],
  },
  {
    email: "athlete.mahesh@khelkhud.dev",
    name: "Mahesh Goud",
    sport: "Kabaddi",
    category: "SENIOR" as const,
    level: "DISTRICT" as const,
    dob: "2004-02-09",
    verification: "VERIFIED" as const,
    bio: "Raider for the mandal team. Working towards state selection trials.",
    achievements: [{ title: "Mandal championship — best raider", level: "DISTRICT" as const, year: 2025 }],
  },
  {
    email: "athlete.anitha@khelkhud.dev",
    name: "Anitha Bai",
    sport: "Athletics",
    category: "UNDER_15" as const,
    level: "DISTRICT" as const,
    dob: "2012-11-02",
    verification: "PENDING" as const,
    bio: "Long jump. Started competing last season after a school sports day win.",
    achievements: [],
  },
];

async function seedDemoData() {
  const villages = await prisma.location.findMany({
    where: { level: LocationLevel.VILLAGE },
    take: 40,
    orderBy: { name: "asc" },
  });
  if (villages.length === 0) {
    console.log("No villages seeded — skipping demo data");
    return;
  }
  const pick = (i: number) => villages[i % villages.length]!;

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.log("No admin user — skipping demo data (coordinators need an appointer)");
    return;
  }

  // ---- coordinators -----------------------------------------------------------
  const coordinators = [];
  for (const [i, c] of DEMO_COORDINATORS.entries()) {
    const village = pick(i * 7);
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: { role: "COORDINATOR" },
      create: { email: c.email, name: c.name, role: "COORDINATOR" },
    });
    const existing = await prisma.coordinatorProfile.findUnique({ where: { userId: user.id } });
    const profile =
      existing ??
      (await prisma.coordinatorProfile.create({
        data: {
          userId: user.id,
          designation: c.designation,
          appointedById: admin.id,
          villages: { connect: [{ id: village.id }] },
        },
      }));
    coordinators.push({ profile, user, village });
  }
  console.log(`Seeded ${coordinators.length} village coordinators`);

  // ---- institutions -----------------------------------------------------------
  const institutions = [];
  for (const [i, c] of coordinators.entries()) {
    const inst = await prisma.institution.create({
      data: {
        villageId: c.village.id,
        kind: i === 0 ? InstitutionKind.SCHOOL : InstitutionKind.PLAYGROUND,
        name: i === 0 ? `ZPHS ${c.village.name}` : `${c.village.name} community ground`,
        description:
          i === 0
            ? "Government high school. One shared set of equipment for 340 students."
            : "Village ground used by three teams and the school.",
        custodianId: c.user.id,
      },
    });
    institutions.push(inst);
  }
  console.log(`Seeded ${institutions.length} institutions`);

  // ---- athletes ---------------------------------------------------------------
  const sports = await prisma.sport.findMany();
  const sportId = (name: string) => sports.find((s) => s.name === name)?.id ?? null;

  const athletes = [];
  for (const [i, a] of DEMO_ATHLETES.entries()) {
    const village = coordinators[i % coordinators.length]!.village;
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { role: "ATHLETE" },
      create: { email: a.email, name: a.name, role: "ATHLETE" },
    });
    const existing = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
    const profile =
      existing ??
      (await prisma.athleteProfile.create({
        data: {
          userId: user.id,
          sportId: sportId(a.sport),
          locationId: village.id,
          dateOfBirth: new Date(a.dob),
          category: a.category,
          experienceLevel: a.level,
          bio: a.bio,
          verificationStatus: a.verification,
          verifiedAt: a.verification === "VERIFIED" ? new Date() : null,
          achievements: { create: a.achievements },
        },
      }));
    athletes.push({ profile, village });
  }
  console.log(`Seeded ${athletes.length} athletes`);

  // ---- requests ---------------------------------------------------------------
  // A coordinator raised each of these, so each is validated on arrival — the whole point
  // of the role. An athlete-raised request would sit at PENDING_VALIDATION instead.
  const validator = coordinators[0]!;

  const makeRequest = async (args: {
    kind: RequestKind;
    title: string;
    description: string;
    villageId: string;
    athleteId?: string;
    institutionId?: string;
    items: { label: string; quantity: number; estimatedPaise: number }[];
  }) => {
    const total = args.items.reduce((s, it) => s + it.estimatedPaise * it.quantity, 0);
    return prisma.request.create({
      data: {
        kind: args.kind,
        title: args.title,
        description: args.description,
        villageId: args.villageId,
        athleteId: args.athleteId,
        institutionId: args.institutionId,
        raisedById: validator.user.id,
        validatedById: validator.profile.id,
        validatedAt: new Date(),
        status: RequestStatus.OPEN,
        totalEstimatedPaise: total,
        items: { create: args.items },
      },
    });
  };

  await makeRequest({
    kind: RequestKind.EQUIPMENT,
    title: "Kabaddi mats for the school ground",
    description:
      "340 students share one worn mat. Practice is on bare earth, and two players were injured last season.",
    villageId: institutions[0]!.villageId,
    institutionId: institutions[0]!.id,
    items: [
      { label: "Kabaddi practice mat (10m x 8m)", quantity: 2, estimatedPaise: 2800000 },
      { label: "Field marking kit", quantity: 1, estimatedPaise: 120000 },
    ],
  });

  await makeRequest({
    kind: RequestKind.EQUIPMENT,
    title: "Running spikes and training kit",
    description: "Currently training barefoot on packed earth.",
    villageId: athletes[0]!.village.id,
    athleteId: athletes[0]!.profile.id,
    items: [
      { label: "Competition running spikes (size 6)", quantity: 1, estimatedPaise: 320000 },
      { label: "Training shoes", quantity: 1, estimatedPaise: 180000 },
    ],
  });

  const cashRequest = await makeRequest({
    kind: RequestKind.CASH,
    title: "State trials — travel and entry",
    description: "Selection trials in Hyderabad, three days including entry fee and stay.",
    villageId: athletes[1]!.village.id,
    athleteId: athletes[1]!.profile.id,
    items: [
      { label: "Bus travel, return", quantity: 1, estimatedPaise: 90000 },
      { label: "Entry fee", quantity: 1, estimatedPaise: 60000 },
      { label: "Three nights stay and meals", quantity: 1, estimatedPaise: 210000 },
    ],
  });

  // One athlete-raised request, left awaiting its coordinator, so the queue is not empty.
  await prisma.request.create({
    data: {
      kind: RequestKind.EQUIPMENT,
      title: "Long jump take-off board",
      description: "The pit has no board; the run-up is measured with chalk each time.",
      villageId: athletes[2]!.village.id,
      athleteId: athletes[2]!.profile.id,
      raisedById: (await prisma.athleteProfile.findUniqueOrThrow({
        where: { id: athletes[2]!.profile.id },
        select: { userId: true },
      })).userId,
      status: RequestStatus.PENDING_VALIDATION,
      totalEstimatedPaise: 450000,
      items: { create: [{ label: "Take-off board and sand rake", quantity: 1, estimatedPaise: 450000 }] },
    },
  });
  console.log("Seeded 4 requests (3 coordinator-validated, 1 pending validation)");

  // ---- a sponsor and one funded cash request ----------------------------------
  const sponsorUser = await prisma.user.upsert({
    where: { email: "sponsor.demo@khelkhud.dev" },
    update: { role: "SPONSOR" },
    create: { email: "sponsor.demo@khelkhud.dev", name: "Ramesh Varma", role: "SPONSOR" },
  });
  const sponsor =
    (await prisma.sponsorProfile.findUnique({ where: { userId: sponsorUser.id } })) ??
    (await prisma.sponsorProfile.create({
      data: {
        userId: sponsorUser.id,
        sponsorType: "INDIVIDUAL",
        displayName: "Ramesh Varma",
        bio: "Grew up in the village, works in Hyderabad now.",
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      },
    }));

  await prisma.sponsorship.create({
    data: {
      code: "KK-2026-0001",
      sponsorId: sponsor.id,
      athleteId: athletes[1]!.profile.id,
      requestId: cashRequest.id,
      amountPaise: 150000,
      purpose: "Travel and entry fee for state trials",
      paymentStatus: "PAID",
      utilizationStatus: "IN_PROGRESS",
      allocations: {
        create: [
          { label: "Bus travel, return", amountPaise: 90000, status: "COMPLETED" },
          { label: "Entry fee", amountPaise: 60000, status: "PURCHASED" },
        ],
      },
    },
  });
  await prisma.request.update({
    where: { id: cashRequest.id },
    data: { raisedAmountPaise: 150000, status: RequestStatus.PARTIALLY_FULFILLED },
  });
  console.log("Seeded 1 sponsor and 1 part-funded cash request");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
