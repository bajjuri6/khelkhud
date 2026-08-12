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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
