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

  // ---------- Sponsorship flow (stub payments) ----------
  const sponsorUser = await prisma.user.upsert({
    where: { email: "test-sponsor@khelkhud.dev" },
    update: { role: "SPONSOR" },
    create: { email: "test-sponsor@khelkhud.dev", name: "Test Sponsor", role: "SPONSOR" },
  });
  await prisma.sponsorProfile.upsert({
    where: { userId: sponsorUser.id },
    update: {},
    create: { userId: sponsorUser.id, displayName: "ABC Foundation", sponsorType: "ORGANIZATION" },
  });
  const sponsorHeaders = {
    cookie: `kk_session=${await signSession({ uid: sponsorUser.id, role: "SPONSOR" })}`,
    "Content-Type": "application/json",
  };

  const requirement = await prisma.sponsorshipRequirement.findFirstOrThrow({
    where: { playerId: profile.id, title: "Season kit" },
  });
  const createRes = await (
    await fetch(`${API}/api/sponsorships`, {
      method: "POST",
      headers: sponsorHeaders,
      body: JSON.stringify({
        playerId: profile.id,
        requirementId: requirement.id,
        amountPaise: 500000,
        purpose: "Cricket bat and kit",
        isAnonymous: false,
      }),
    })
  ).json();
  check("create sponsorship", Boolean(createRes.data?.sponsorshipId), createRes);
  check("SPN code format", /^SPN-\d{4}-\d{5}$/.test(createRes.data?.code ?? ""), createRes.data?.code);
  check("stub provider", createRes.data?.provider === "STUB", createRes.data?.provider);

  const verifyRes = await (
    await fetch(`${API}/api/sponsorships/${createRes.data.sponsorshipId}/verify-payment`, {
      method: "POST",
      headers: sponsorHeaders,
      body: JSON.stringify({
        razorpayOrderId: createRes.data.orderId,
        razorpayPaymentId: `pay_stub_${Date.now()}`,
        razorpaySignature: "stub",
      }),
    })
  ).json();
  check("verify payment -> PAID", verifyRes.data?.paymentStatus === "PAID", verifyRes);

  const reqAfter = await prisma.sponsorshipRequirement.findUniqueOrThrow({
    where: { id: requirement.id },
  });
  check(
    "requirement raised bumped",
    reqAfter.raisedAmountPaise >= 500000 && reqAfter.status === "PARTIALLY_FUNDED",
    { raised: reqAfter.raisedAmountPaise, status: reqAfter.status },
  );

  const playerNotif = await prisma.notification.findFirst({
    where: { userId: user.id, type: "SPONSORSHIP_RECEIVED" },
  });
  check("player notified", Boolean(playerNotif), playerNotif?.title);

  // Player sees the sponsorship; anonymity respected on anonymous ones
  const playerList = await (
    await fetch(`${API}/api/players/me/sponsorships`, { headers })
  ).json();
  check(
    "player sees sponsorship",
    playerList.data?.some((s: { code: string }) => s.code === createRes.data.code),
  );

  // Sponsor detail view
  const detail = await (
    await fetch(`${API}/api/sponsorships/${createRes.data.sponsorshipId}`, {
      headers: sponsorHeaders,
    })
  ).json();
  check("sponsor detail has transactions", Array.isArray(detail.data?.transactions), detail.data);
  check(
    "detail transactions CREATED+PAID",
    detail.data?.transactions?.length === 2,
    detail.data?.transactions?.map((t: { status: string }) => t.status),
  );

  // verify-payment is idempotent
  const verifyAgain = await (
    await fetch(`${API}/api/sponsorships/${createRes.data.sponsorshipId}/verify-payment`, {
      method: "POST",
      headers: sponsorHeaders,
      body: JSON.stringify({
        razorpayOrderId: createRes.data.orderId,
        razorpayPaymentId: `pay_stub_${Date.now()}`,
        razorpaySignature: "stub",
      }),
    })
  ).json();
  check("verify idempotent", verifyAgain.data?.paymentStatus === "PAID", verifyAgain);
  const txCount = await prisma.transaction.count({
    where: { sponsorshipId: createRes.data.sponsorshipId },
  });
  check("no duplicate PAID transaction", txCount === 2, txCount);

  // ---------- Tracking: allocations + updates ----------
  const sid = createRes.data.sponsorshipId as string;

  const alloc1 = await (
    await fetch(`${API}/api/sponsorships/${sid}/allocations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ label: "Cricket bat", amountPaise: 300000 }),
    })
  ).json();
  check("create allocation", Boolean(alloc1.data?.id), alloc1);

  const overAlloc = await fetch(`${API}/api/sponsorships/${sid}/allocations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ label: "Too much", amountPaise: 300000 }),
  });
  check("over-allocation rejected", overAlloc.status === 400, overAlloc.status);

  const marked = await (
    await fetch(`${API}/api/sponsorships/${sid}/allocations/${alloc1.data.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "PURCHASED" }),
    })
  ).json();
  check("allocation -> PURCHASED", marked.data?.status === "PURCHASED", marked);

  const afterAlloc = await prisma.sponsorship.findUniqueOrThrow({ where: { id: sid } });
  check("utilization IN_PROGRESS", afterAlloc.utilizationStatus === "IN_PROGRESS", afterAlloc.utilizationStatus);

  // Receipt upload + attach
  const receiptPresign = await (
    await fetch(`${API}/api/uploads/presign`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "RECEIPT",
        fileName: "receipt.png",
        mimeType: "image/png",
        sizeBytes: png.length,
      }),
    })
  ).json();
  await fetch(receiptPresign.data.uploadUrl, {
    method: "PUT",
    headers: receiptPresign.data.headers,
    body: png,
  });
  const receiptDoc = await (
    await fetch(`${API}/api/uploads/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        storageKey: receiptPresign.data.storageKey,
        kind: "RECEIPT",
        fileName: "receipt.png",
        mimeType: "image/png",
        sizeBytes: png.length,
        attach: { sponsorshipId: sid },
      }),
    })
  ).json();
  const withReceipt = await (
    await fetch(`${API}/api/sponsorships/${sid}/allocations/${alloc1.data.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ receiptDocumentId: receiptDoc.data.id, status: "COMPLETED" }),
    })
  ).json();
  check("receipt attached + COMPLETED", withReceipt.data?.receiptDocumentId === receiptDoc.data.id);

  const afterComplete = await prisma.sponsorship.findUniqueOrThrow({ where: { id: sid } });
  check(
    "utilization COMPLETED + sponsorship COMPLETED",
    afterComplete.utilizationStatus === "COMPLETED" && afterComplete.status === "COMPLETED",
    { u: afterComplete.utilizationStatus, s: afterComplete.status },
  );

  // Linked update notifies sponsor; not public
  const linkedUpdate = await (
    await fetch(`${API}/api/updates`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Bought the new bat!",
        body: "Purchased cricket bat and shoes using the sponsored amount.",
        sponsorshipId: sid,
        documentIds: [],
      }),
    })
  ).json();
  check("post linked update", Boolean(linkedUpdate.data?.id), linkedUpdate);
  const sponsorNotif = await prisma.notification.findFirst({
    where: { userId: sponsorUser.id, type: "PLAYER_UPDATE" },
    orderBy: { createdAt: "desc" },
  });
  check("sponsor notified of update", Boolean(sponsorNotif), sponsorNotif?.title);

  // General update is public
  await fetch(`${API}/api/updates`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Training camp completed",
      body: "Finished a 2-week training camp.",
      documentIds: [],
    }),
  });
  const publicUpdates = await (
    await fetch(`${API}/api/players/${profile.id}/updates`)
  ).json();
  const titles = (publicUpdates.data ?? []).map((u: { title: string }) => u.title);
  check("general update public", titles.includes("Training camp completed"), titles);
  check("linked update NOT public", !titles.includes("Bought the new bat!"), titles);

  // Sponsor sees the update in the detail feed
  const detailAfter = await (
    await fetch(`${API}/api/sponsorships/${sid}`, { headers: sponsorHeaders })
  ).json();
  check(
    "sponsor sees linked update",
    detailAfter.data?.updates?.some((u: { title: string }) => u.title === "Bought the new bat!"),
  );

  // ---------- Admin ----------
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const adminHeaders = {
    cookie: `kk_session=${await signSession({ uid: adminUser.id, role: "ADMIN" })}`,
    "Content-Type": "application/json",
  };

  const forbidden = await fetch(`${API}/api/admin/stats`, { headers });
  check("admin routes forbidden for player", forbidden.status === 403, forbidden.status);

  const stats = await (await fetch(`${API}/api/admin/stats`, { headers: adminHeaders })).json();
  check(
    "admin stats shape",
    typeof stats.data?.totalSponsoredPaise === "number" &&
      Array.isArray(stats.data?.bySport) &&
      stats.data.totalPlayers >= 6,
    stats.data,
  );

  const queue = await (
    await fetch(`${API}/api/admin/verifications`, { headers: adminHeaders })
  ).json();
  check(
    "verification queue has pending profiles",
    (queue.data?.players?.length ?? 0) > 0,
    queue.data?.players?.length,
  );

  // Approve the smoke-test player, verify effects, then revert for repeatability
  const approveRes = await (
    await fetch(`${API}/api/admin/verifications/player/${profile.id}`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ decision: "VERIFIED" }),
    })
  ).json();
  check("admin approve", approveRes.data?.ok === true, approveRes);
  const verifiedProfile = await prisma.playerProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  check("profile now VERIFIED", verifiedProfile.verificationStatus === "VERIFIED");
  const record = await prisma.verificationRecord.findFirst({
    where: { subjectPlayerId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  check("verification record written", record?.decision === "VERIFIED", record);
  const verifyNotif = await prisma.notification.findFirst({
    where: { userId: user.id, type: "VERIFICATION_RESULT" },
    orderBy: { createdAt: "desc" },
  });
  check("player notified of verification", Boolean(verifyNotif), verifyNotif?.title);

  const inDiscovery = await (await fetch(`${API}/api/players`)).json();
  check(
    "verified player appears in default discovery",
    inDiscovery.data?.some((p: { id: string }) => p.id === profile.id),
  );
  // Revert so repeated smoke runs keep exercising the queue
  await prisma.playerProfile.update({
    where: { id: profile.id },
    data: { verificationStatus: "PENDING", verifiedAt: null },
  });

  console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
