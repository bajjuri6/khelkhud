/**
 * Dev smoke test: exercises the API over HTTP as a real player would.
 * Requires the API dev server running. Run from apps/api:
 *   pnpm dlx dotenv-cli -e ../../.env -- tsx scripts/smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import { signSession } from "../src/lib/session.js";
import { config } from "../src/config.js";

const prisma = new PrismaClient();
const API = config.API_URL;

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok: ${label}`);
  } else {
    failures++;
    console.error(`FAIL: ${label}`, detail ?? "");
  }
}

async function main() {
  // Test player with session cookie
  const user = await prisma.user.upsert({
    where: { email: "test-player@khelkhud.dev" },
    update: {},
    create: { email: "test-player@khelkhud.dev", name: "Test Player", role: "PLAYER" },
  });
  if (user.role !== "PLAYER") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "PLAYER" } });
  }
  await prisma.playerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  const cookie = `kk_session=${await signSession({ uid: user.id, role: "PLAYER" })}`;
  const headers = { cookie, "Content-Type": "application/json" };

  // Meta
  const sports = await (await fetch(`${API}/api/meta/sports`)).json();
  check("meta/sports returns 12", sports.data?.length === 12, sports.data?.length);
  const states = await (await fetch(`${API}/api/meta/locations?level=STATE`)).json();
  check("meta/locations has 4 states", states.data?.length === 4, states.data?.length);
  const cricket = sports.data.find((s: { name: string }) => s.name === "Cricket");
  const districts = await (
    await fetch(`${API}/api/meta/locations?level=DISTRICT&parentId=${states.data[0].id}`)
  ).json();
  const cities = await (
    await fetch(`${API}/api/meta/locations?level=CITY&parentId=${districts.data[0].id}`)
  ).json();

  // Profile update
  const putRes = await fetch(`${API}/api/players/me`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      sportId: cricket.id,
      locationId: cities.data[0].id,
      dateOfBirth: new Date("2008-04-15").toISOString(),
      category: "UNDER_19",
      experienceLevel: "DISTRICT",
      bio: "Smoke-test athlete bio",
      coachName: "Coach K",
      coachContact: "9999999999",
    }),
  });
  check("PUT /players/me", putRes.ok, putRes.status);

  // Achievement + event + requirement
  const ach = await fetch(`${API}/api/players/me/achievements`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "District U-19 Champion", level: "DISTRICT", year: 2025 }),
  });
  check("POST achievement", ach.status === 201, ach.status);

  const ev = await fetch(`${API}/api/players/me/events`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "State Trials",
      date: new Date("2026-10-01").toISOString(),
      venue: "Hyderabad",
      estimatedExpensePaise: 500000,
      isUpcoming: true,
    }),
  });
  check("POST event", ev.status === 201, ev.status);

  const reqRes = await fetch(`${API}/api/players/me/requirements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Season kit",
      description: "Bat, pads and travel",
      totalAmountPaise: 1500000,
      breakdown: [
        { label: "Cricket bat", amountPaise: 400000 },
        { label: "Kit", amountPaise: 500000 },
        { label: "Travel", amountPaise: 600000 },
      ],
    }),
  });
  check("POST requirement", reqRes.status === 201, reqRes.status);

  // Upload flow (1x1 px PNG)
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const presign = await (
    await fetch(`${API}/api/uploads/presign`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "PROFILE_PHOTO",
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: png.length,
      }),
    })
  ).json();
  check("presign", Boolean(presign.data?.uploadUrl), presign);
  const putUpload = await fetch(presign.data.uploadUrl, {
    method: "PUT",
    headers: presign.data.headers,
    body: png,
  });
  check("local PUT upload", putUpload.ok, putUpload.status);
  const confirm = await (
    await fetch(`${API}/api/uploads/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        storageKey: presign.data.storageKey,
        kind: "PROFILE_PHOTO",
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: png.length,
      }),
    })
  ).json();
  check("confirm upload", Boolean(confirm.data?.id), confirm);

  await fetch(`${API}/api/players/me`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ photoKey: presign.data.storageKey }),
  });

  // Public photo serving
  const photoRes = await fetch(
    `${API}/api/files/photo?key=${encodeURIComponent(presign.data.storageKey)}`,
  );
  check("public photo serves", photoRes.ok, photoRes.status);

  // Public profile
  const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: user.id } });
  const pub = await (await fetch(`${API}/api/players/${profile.id}`)).json();
  check("public profile name", pub.data?.name === "Test Player", pub.data?.name);
  check("public profile hides coach contact", !("coachContact" in (pub.data ?? {})), pub.data);
  check("public profile has age not DOB", typeof pub.data?.age === "number" && !pub.data?.dateOfBirth);
  check(
    "public profile requirement present",
    pub.data?.requirements?.some((r: { title: string }) => r.title === "Season kit"),
  );
  check("public location label", String(pub.data?.locationLabel ?? "").includes(","), pub.data?.locationLabel);

  console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
