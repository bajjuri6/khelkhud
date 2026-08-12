import { PrismaClient, LocationLevel } from "@prisma/client";

const prisma = new PrismaClient();

const SPORTS = [
  "Cricket",
  "Football",
  "Hockey",
  "Badminton",
  "Kabaddi",
  "Athletics",
  "Wrestling",
  "Boxing",
  "Table Tennis",
  "Swimming",
  "Archery",
  "Weightlifting",
];

// State -> District -> Cities
const LOCATIONS: Record<string, Record<string, string[]>> = {
  Telangana: {
    Hyderabad: ["Hyderabad City", "Secunderabad"],
    Warangal: ["Warangal City"],
  },
  Maharashtra: {
    Mumbai: ["Mumbai City"],
    Pune: ["Pune City", "Pimpri-Chinchwad"],
  },
  Karnataka: {
    "Bengaluru Urban": ["Bengaluru"],
  },
  "Andhra Pradesh": {
    Guntur: ["Guntur City"],
    Krishna: ["Vijayawada"],
  },
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-");
}

// Compound unique (name, level, parentId) can't be used in upsert when parentId
// is null (Postgres treats NULLs as distinct), so find-or-create instead.
async function findOrCreateLocation(name: string, level: LocationLevel, parentId: string | null) {
  const existing = await prisma.location.findFirst({ where: { name, level, parentId } });
  if (existing) return existing;
  return prisma.location.create({ data: { name, level, parentId } });
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

  let locationCount = 0;
  for (const [stateName, districts] of Object.entries(LOCATIONS)) {
    const state = await findOrCreateLocation(stateName, LocationLevel.STATE, null);
    locationCount++;
    for (const [districtName, cities] of Object.entries(districts)) {
      const district = await findOrCreateLocation(districtName, LocationLevel.DISTRICT, state.id);
      locationCount++;
      for (const cityName of cities) {
        await findOrCreateLocation(cityName, LocationLevel.CITY, district.id);
        locationCount++;
      }
    }
  }
  console.log(`Seeded ${locationCount} locations`);

  for (const email of ADMIN_EMAILS) {
    await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN" },
      create: { email, name: "Admin", role: "ADMIN" },
    });
    console.log(`Seeded admin: ${email}`);
  }

  await seedDemoData();
}

// ---------- Demo data (players, sponsors, sponsorships) ----------

const DEMO_PLAYERS = [
  {
    email: "demo.player1@khelkhud.dev",
    name: "Rahul Kumar",
    sport: "Cricket",
    city: "Hyderabad City",
    category: "UNDER_19",
    level: "DISTRICT",
    dob: "2008-03-12",
    verification: "VERIFIED",
    bio: "Right-handed batsman from Hyderabad. Playing since age 9, dreaming of representing Telangana at the U-19 state level.",
    achievements: [
      { title: "District U-19 Champion", level: "DISTRICT", year: 2025 },
      { title: "Best Batsman — Inter-School Cup", level: "DISTRICT", year: 2024 },
    ],
    events: [{ name: "State U-19 Trials", inDays: 45, venue: "Hyderabad", expense: 800000 }],
    requirement: {
      title: "Season kit and tournament travel",
      description: "Equipment and travel for the upcoming state trials season.",
      breakdown: [
        { label: "Cricket bat", amountPaise: 400000 },
        { label: "Kit and pads", amountPaise: 500000 },
        { label: "Travel", amountPaise: 600000 },
      ],
    },
  },
  {
    email: "demo.player2@khelkhud.dev",
    name: "Ananya Reddy",
    sport: "Badminton",
    city: "Secunderabad",
    category: "UNDER_15",
    level: "STATE",
    dob: "2011-07-25",
    verification: "VERIFIED",
    bio: "State-ranked shuttler training 5 hours a day. Aiming for the national junior circuit.",
    achievements: [
      { title: "State U-15 Runner-up", level: "STATE", year: 2025 },
      { title: "District Champion", level: "DISTRICT", year: 2024 },
    ],
    events: [{ name: "Junior National Qualifiers", inDays: 60, venue: "Bengaluru", expense: 1200000 }],
    requirement: {
      title: "Racquets and coaching fees",
      description: "Two tournament-grade racquets and three months of academy coaching.",
      breakdown: [
        { label: "Racquets (x2)", amountPaise: 900000 },
        { label: "Coaching fees", amountPaise: 1500000 },
      ],
    },
  },
  {
    email: "demo.player3@khelkhud.dev",
    name: "Vikram Singh",
    sport: "Athletics",
    city: "Pune City",
    category: "SENIOR",
    level: "STATE",
    dob: "2004-11-02",
    verification: "VERIFIED",
    bio: "400m sprinter chasing the national qualifying mark. Trains at Balewadi stadium.",
    achievements: [{ title: "State Meet Gold — 400m", level: "STATE", year: 2025 }],
    events: [{ name: "Federation Cup", inDays: 90, venue: "Delhi", expense: 1500000 }],
    requirement: {
      title: "Spikes, physio and travel",
      breakdown: [
        { label: "Running spikes", amountPaise: 800000 },
        { label: "Physiotherapy", amountPaise: 700000 },
        { label: "Travel to nationals", amountPaise: 1000000 },
      ],
    },
  },
  {
    email: "demo.player4@khelkhud.dev",
    name: "Sneha Patil",
    sport: "Swimming",
    city: "Mumbai City",
    category: "UNDER_19",
    level: "NATIONAL",
    dob: "2009-01-18",
    verification: "VERIFIED",
    bio: "National-level 200m freestyle swimmer balancing school and 6 training sessions a week.",
    achievements: [{ title: "National U-17 Finalist", level: "NATIONAL", year: 2025 }],
    events: [],
    requirement: {
      title: "Pool fees and nutrition",
      breakdown: [
        { label: "Pool membership (6 months)", amountPaise: 1800000 },
        { label: "Nutrition plan", amountPaise: 900000 },
      ],
    },
  },
  {
    email: "demo.player5@khelkhud.dev",
    name: "Arjun Naik",
    sport: "Kabaddi",
    city: "Warangal City",
    category: "UNDER_19",
    level: "DISTRICT",
    dob: "2007-09-30",
    verification: "PENDING",
    bio: "Raider from Warangal, captain of the school team.",
    achievements: [{ title: "Inter-School Champion", level: "DISTRICT", year: 2025 }],
    events: [],
    requirement: {
      title: "Team kit and mat fees",
      breakdown: [
        { label: "Kit", amountPaise: 300000 },
        { label: "Mat practice fees", amountPaise: 200000 },
      ],
    },
  },
  {
    email: "demo.player6@khelkhud.dev",
    name: "Kiran Rao",
    sport: "Football",
    city: "Bengaluru",
    category: "UNDER_15",
    level: "BEGINNER",
    dob: "2012-05-05",
    verification: "REJECTED",
    bio: "Young striker looking for academy support.",
    achievements: [],
    events: [],
    requirement: {
      title: "Boots and academy trial fees",
      breakdown: [
        { label: "Football boots", amountPaise: 250000 },
        { label: "Trial fees", amountPaise: 150000 },
      ],
    },
  },
] as const;

const DEMO_SPONSORS = [
  {
    email: "demo.sponsor1@khelkhud.dev",
    name: "ABC Foundation",
    displayName: "ABC Foundation",
    type: "ORGANIZATION",
    orgName: "ABC Charitable Foundation",
    city: "Hyderabad City",
    verification: "VERIFIED",
    anonymous: false,
  },
  {
    email: "demo.sponsor2@khelkhud.dev",
    name: "Ravi Kumar",
    displayName: "Ravi Kumar",
    type: "INDIVIDUAL",
    orgName: null,
    city: "Pune City",
    verification: "VERIFIED",
    anonymous: false,
  },
  {
    email: "demo.sponsor3@khelkhud.dev",
    name: "SportsCorp",
    displayName: "SportsCorp India",
    type: "COMPANY",
    orgName: "SportsCorp India Pvt Ltd",
    city: "Mumbai City",
    verification: "PENDING",
    anonymous: true,
  },
] as const;

async function nextCode(): Promise<string> {
  const year = new Date().getFullYear();
  const counterId = `SPN-${year}`;
  const counter = await prisma.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${counterId}-${String(counter.value).padStart(5, "0")}`;
}

async function seedDemoData() {
  const cities = await prisma.location.findMany({ where: { level: "CITY" } });
  const cityByName = new Map(cities.map((c) => [c.name, c]));
  const sports = await prisma.sport.findMany();
  const sportByName = new Map(sports.map((s) => [s.name, s]));

  const playerProfiles: Record<string, string> = {};
  for (const p of DEMO_PLAYERS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, name: p.name, role: "PLAYER" },
    });
    const existing = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      playerProfiles[p.email] = existing.id;
      continue;
    }
    const profile = await prisma.playerProfile.create({
      data: {
        userId: user.id,
        sportId: sportByName.get(p.sport)?.id,
        locationId: cityByName.get(p.city)?.id,
        dateOfBirth: new Date(p.dob),
        category: p.category,
        experienceLevel: p.level,
        bio: p.bio,
        verificationStatus: p.verification,
        verifiedAt: p.verification === "VERIFIED" ? new Date() : null,
        achievements: { create: [...p.achievements] },
        events: {
          create: p.events.map((e) => ({
            name: e.name,
            date: new Date(Date.now() + e.inDays * 24 * 3600 * 1000),
            venue: e.venue,
            estimatedExpensePaise: e.expense,
            isUpcoming: true,
          })),
        },
      },
    });
    const total = p.requirement.breakdown.reduce((s, b) => s + b.amountPaise, 0);
    await prisma.sponsorshipRequirement.create({
      data: {
        playerId: profile.id,
        title: p.requirement.title,
        description: "description" in p.requirement ? p.requirement.description : null,
        totalAmountPaise: total,
        breakdown: [...p.requirement.breakdown],
      },
    });
    playerProfiles[p.email] = profile.id;
  }
  console.log(`Seeded ${DEMO_PLAYERS.length} demo players`);

  const sponsorProfiles: Record<string, string> = {};
  for (const s of DEMO_SPONSORS) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, name: s.name, role: "SPONSOR" },
    });
    const existing = await prisma.sponsorProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      sponsorProfiles[s.email] = existing.id;
      continue;
    }
    const profile = await prisma.sponsorProfile.create({
      data: {
        userId: user.id,
        sponsorType: s.type,
        displayName: s.displayName,
        orgName: s.orgName,
        locationId: cityByName.get(s.city)?.id,
        isAnonymousByDefault: s.anonymous,
        verificationStatus: s.verification,
        verifiedAt: s.verification === "VERIFIED" ? new Date() : null,
      },
    });
    sponsorProfiles[s.email] = profile.id;
  }
  console.log(`Seeded ${DEMO_SPONSORS.length} demo sponsors`);

  // Two paid sponsorships with tracking state, only on first run.
  const sponsor1 = sponsorProfiles["demo.sponsor1@khelkhud.dev"]!;
  const alreadySeeded = await prisma.sponsorship.findFirst({ where: { sponsorId: sponsor1 } });
  if (alreadySeeded) return;

  const player1 = playerProfiles["demo.player1@khelkhud.dev"]!;
  const req1 = await prisma.sponsorshipRequirement.findFirstOrThrow({
    where: { playerId: player1 },
  });
  const s1 = await prisma.sponsorship.create({
    data: {
      code: await nextCode(),
      sponsorId: sponsor1,
      playerId: player1,
      requirementId: req1.id,
      amountPaise: 1000000,
      purpose: "Cricket Equipment",
      paymentStatus: "PAID",
      utilizationStatus: "IN_PROGRESS",
      razorpayOrderId: "order_seed_demo1",
      razorpayPaymentId: "pay_seed_demo1",
      allocations: {
        create: [
          { label: "Cricket bat", amountPaise: 400000, status: "COMPLETED", completedAt: new Date() },
          { label: "Cricket shoes", amountPaise: 200000, status: "PURCHASED" },
          { label: "Travel", amountPaise: 200000, status: "PLANNED" },
        ],
      },
      transactions: {
        create: [
          { amountPaise: 1000000, provider: "SEED", providerOrderId: "order_seed_demo1", status: "CREATED" },
          {
            amountPaise: 1000000,
            provider: "SEED",
            providerOrderId: "order_seed_demo1",
            providerPaymentId: "pay_seed_demo1",
            status: "PAID",
          },
        ],
      },
    },
  });
  await prisma.sponsorshipRequirement.update({
    where: { id: req1.id },
    data: { raisedAmountPaise: { increment: 1000000 }, status: "PARTIALLY_FUNDED" },
  });
  await prisma.sponsorshipUpdate.create({
    data: {
      playerId: player1,
      sponsorshipId: s1.id,
      title: "Purchased cricket bat and shoes",
      body: "Bought a new English willow bat and spikes using the sponsorship support. Thank you ABC Foundation!",
    },
  });

  const sponsor2 = sponsorProfiles["demo.sponsor2@khelkhud.dev"]!;
  const player3 = playerProfiles["demo.player3@khelkhud.dev"]!;
  const req3 = await prisma.sponsorshipRequirement.findFirstOrThrow({
    where: { playerId: player3 },
  });
  await prisma.sponsorship.create({
    data: {
      code: await nextCode(),
      sponsorId: sponsor2,
      playerId: player3,
      requirementId: req3.id,
      amountPaise: 500000,
      purpose: "Running spikes",
      paymentStatus: "PAID",
      razorpayOrderId: "order_seed_demo2",
      razorpayPaymentId: "pay_seed_demo2",
      transactions: {
        create: [
          {
            amountPaise: 500000,
            provider: "SEED",
            providerOrderId: "order_seed_demo2",
            providerPaymentId: "pay_seed_demo2",
            status: "PAID",
          },
        ],
      },
    },
  });
  await prisma.sponsorshipRequirement.update({
    where: { id: req3.id },
    data: { raisedAmountPaise: { increment: 500000 }, status: "PARTIALLY_FUNDED" },
  });
  console.log("Seeded 2 demo sponsorships with tracking state");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
