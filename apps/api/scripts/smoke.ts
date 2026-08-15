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
    create: { email: "test-player@khelkhud.dev", name: "Test Player", role: "ATHLETE" },
  });
  if (user.role !== "ATHLETE") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "ATHLETE" } });
  }
  const existingProfile = await prisma.athleteProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // Requests survive between runs on the same test athlete, and a validated "Season kit"
  // left behind makes the "not yet public" assertion fail against last run's data rather
  // than this one's. Clear them so the script is repeatable.
  const priorSponsorships = await prisma.sponsorship.findMany({
    where: { athleteId: existingProfile.id },
    select: { id: true },
  });
  const priorIds = priorSponsorships.map((x) => x.id);
  if (priorIds.length > 0) {
    // Children first: allocations, updates, transactions and documents all FK to
    // Sponsorship, and Postgres will not let the parent go while they point at it.
    await prisma.sponsorshipAllocation.deleteMany({ where: { sponsorshipId: { in: priorIds } } });
    await prisma.sponsorshipUpdate.deleteMany({ where: { sponsorshipId: { in: priorIds } } });
    await prisma.transaction.deleteMany({ where: { sponsorshipId: { in: priorIds } } });
    await prisma.document.deleteMany({ where: { sponsorshipId: { in: priorIds } } });
    await prisma.sponsorship.deleteMany({ where: { id: { in: priorIds } } });
  }
  await prisma.requestItem.deleteMany({ where: { request: { athleteId: existingProfile.id } } });
  await prisma.request.deleteMany({ where: { athleteId: existingProfile.id } });
  const cookie = `kk_session=${await signSession({ uid: user.id, role: "ATHLETE" })}`;
  const headers = { cookie, "Content-Type": "application/json" };

  // Meta
  const sports = await (await fetch(`${API}/api/meta/sports`)).json();
  // Not an exact count: the sport list grows as the catalogue does, and asserting "12"
  // just means the next person to add a sport gets a red build for no reason.
  check(
    "meta/sports returns the pilot sports",
    ["Cricket", "Kabaddi", "Athletics", "Volleyball"].every((n: string) =>
      sports.data?.some((s: { name: string }) => s.name === n),
    ),
    sports.data?.map((s: { name: string }) => s.name),
  );
  const states = await (await fetch(`${API}/api/meta/locations?level=STATE`)).json();
  check(
    "meta/locations returns the pilot state",
    states.data?.some((l: { name: string }) => l.name === "Telangana"),
    states.data?.map((l: { name: string }) => l.name),
  );
  const cricket = sports.data.find((s: { name: string }) => s.name === "Cricket");
  const districts = await (
    await fetch(`${API}/api/meta/locations?level=DISTRICT&parentId=${states.data[0].id}`)
  ).json();
  // v2 requests are raised in a village, not a city: villageId is required and must be
  // LEVEL=VILLAGE. Resolved through the public search so this exercises the same path the
  // village picker uses.
  const villageSearch = await (
    await fetch(`${API}/api/meta/villages/search?q=Abbenda`)
  ).json();
  const village = villageSearch.data?.[0];
  check("village resolver returns a village", Boolean(village), villageSearch);

  // Profile update
  const putRes = await fetch(`${API}/api/athletes/me`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      sportId: cricket.id,
      locationId: village.id,
      dateOfBirth: new Date("2008-04-15").toISOString(),
      category: "UNDER_19",
      experienceLevel: "DISTRICT",
      bio: "Smoke-test athlete bio",
      coachName: "Coach K",
      coachContact: "9999999999",
    }),
  });
  check("PUT /athletes/me", putRes.ok, putRes.status);

  // Achievement + event + requirement
  const ach = await fetch(`${API}/api/athletes/me/achievements`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "District U-19 Champion", level: "DISTRICT", year: 2025 }),
  });
  check("POST achievement", ach.status === 201, ach.status);

  const ev = await fetch(`${API}/api/athletes/me/events`, {
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

  const reqRes = await fetch(`${API}/api/athletes/me/requests`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "CASH",
      title: "Season kit",
      description: "Bat, pads and travel",
      items: [
        { label: "Cricket bat", quantity: 1, estimatedPaise: 400000 },
        { label: "Kit", quantity: 1, estimatedPaise: 500000 },
        { label: "Travel", quantity: 1, estimatedPaise: 600000 },
      ],
    }),
  });
  const created = await reqRes.json();
  check("POST request", reqRes.status === 201, reqRes.status);
  // The total is summed server-side; a client-supplied one is ignored on purpose.
  check("total computed server-side", created.data?.totalEstimatedPaise === 1500000, created.data?.totalEstimatedPaise);
  check(
    "request waits for validation",
    created.data?.status === "PENDING_VALIDATION",
    created.data?.status,
  );
  const requestId: string = created.data?.id;

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

  await fetch(`${API}/api/athletes/me`, {
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
  const profile = await prisma.athleteProfile.findUniqueOrThrow({ where: { userId: user.id } });
  const pub = await (await fetch(`${API}/api/athletes/${profile.id}`)).json();
  check("public profile name", pub.data?.name === "Test Player", pub.data?.name);
  check("public profile hides coach contact", !("coachContact" in (pub.data ?? {})), pub.data);
  check("public profile has age not DOB", typeof pub.data?.age === "number" && !pub.data?.dateOfBirth);
  // Not public yet: an athlete vouching for themselves is not validation.
  check(
    "pending request is hidden from the public profile",
    !pub.data?.requests?.some((r: { title: string }) => r.title === "Season kit"),
    pub.data?.requests,
  );
  check("public location label", String(pub.data?.locationLabel ?? "").includes(","), pub.data?.locationLabel);

  // ---------- Coordinator validation ----------
  // The core v2 trust flow: the request only reaches sponsors once someone local approves.
  const coordUser = await prisma.user.upsert({
    where: { email: "test-coordinator@khelkhud.dev" },
    update: { role: "COORDINATOR" },
    create: { email: "test-coordinator@khelkhud.dev", name: "Test Coordinator", role: "COORDINATOR" },
  });
  const adminForAppointment = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  await prisma.coordinatorProfile.upsert({
    where: { userId: coordUser.id },
    update: { isActive: true, villages: { set: [{ id: village.id }] } },
    create: {
      userId: coordUser.id,
      designation: "PET teacher, smoke test",
      appointedById: adminForAppointment.id,
      villages: { connect: [{ id: village.id }] },
    },
  });
  const coordHeaders = {
    cookie: `kk_session=${await signSession({ uid: coordUser.id, role: "COORDINATOR" })}`,
    "Content-Type": "application/json",
  };

  const coordQueue = await (
    await fetch(`${API}/api/coordinators/me/queue`, { headers: coordHeaders })
  ).json();
  check(
    "request appears in the coordinator queue",
    coordQueue.data?.pending?.some((r: { id: string }) => r.id === requestId),
    coordQueue.data?.pending?.length,
  );

  const decideRes = await fetch(`${API}/api/coordinators/requests/${requestId}/decide`, {
    method: "POST",
    headers: coordHeaders,
    body: JSON.stringify({ decision: "APPROVE" }),
  });
  check("coordinator approves", decideRes.ok, decideRes.status);

  const pubAfter = await (await fetch(`${API}/api/athletes/${profile.id}`)).json();
  check(
    "validated request is now public",
    pubAfter.data?.requests?.some((r: { title: string }) => r.title === "Season kit"),
    pubAfter.data?.requests,
  );
  check(
    "public profile names who vouched",
    Boolean(
      pubAfter.data?.requests?.find((r: { title: string }) => r.title === "Season kit")
        ?.validatedBy?.designation,
    ),
  );

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

  const request = await prisma.request.findFirstOrThrow({
    where: { athleteId: profile.id, title: "Season kit" },
  });
  const createRes = await (
    await fetch(`${API}/api/sponsorships`, {
      method: "POST",
      headers: sponsorHeaders,
      body: JSON.stringify({
        athleteId: profile.id,
        requestId: request.id,
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

  const reqAfter = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
  check(
    "request raised amount bumped",
    reqAfter.raisedAmountPaise >= 500000 && reqAfter.status === "PARTIALLY_FULFILLED",
    { raised: reqAfter.raisedAmountPaise, status: reqAfter.status },
  );

  const playerNotif = await prisma.notification.findFirst({
    where: { userId: user.id, type: "SPONSORSHIP_RECEIVED" },
  });
  check("athlete notified", Boolean(playerNotif), playerNotif?.title);

  // Player sees the sponsorship; anonymity respected on anonymous ones
  const playerList = await (
    await fetch(`${API}/api/athletes/me/sponsorships`, { headers })
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
    where: { userId: sponsorUser.id, type: "ATHLETE_UPDATE" },
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
    await fetch(`${API}/api/athletes/${profile.id}/updates`)
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
  check("admin routes forbidden for athlete", forbidden.status === 403, forbidden.status);

  const stats = await (await fetch(`${API}/api/admin/stats`, { headers: adminHeaders })).json();
  check(
    "admin stats shape",
    typeof stats.data?.totalSponsoredPaise === "number" &&
      Array.isArray(stats.data?.bySport) &&
      stats.data.totalAthletes >= 6,
    stats.data,
  );

  const queue = await (
    await fetch(`${API}/api/admin/verifications`, { headers: adminHeaders })
  ).json();
  check(
    "verification queue has pending profiles",
    (queue.data?.athletes?.length ?? 0) > 0,
    queue.data?.athletes?.length,
  );

  // Approve the smoke-test player, verify effects, then revert for repeatability
  const approveRes = await (
    await fetch(`${API}/api/admin/verifications/athlete/${profile.id}`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ decision: "VERIFIED" }),
    })
  ).json();
  check("admin approve", approveRes.data?.ok === true, approveRes);
  const verifiedProfile = await prisma.athleteProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  check("profile now VERIFIED", verifiedProfile.verificationStatus === "VERIFIED");
  const record = await prisma.verificationRecord.findFirst({
    where: { subjectAthleteId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  check("verification record written", record?.decision === "VERIFIED", record);
  const verifyNotif = await prisma.notification.findFirst({
    where: { userId: user.id, type: "VERIFICATION_RESULT" },
    orderBy: { createdAt: "desc" },
  });
  check("athlete notified of verification", Boolean(verifyNotif), verifyNotif?.title);

  const inDiscovery = await (await fetch(`${API}/api/athletes`)).json();
  check(
    "verified athlete appears in default discovery",
    inDiscovery.data?.some((p: { id: string }) => p.id === profile.id),
  );
  // Revert so repeated smoke runs keep exercising the queue
  await prisma.athleteProfile.update({
    where: { id: profile.id },
    data: { verificationStatus: "PENDING", verifiedAt: null },
  });

  // ---------- Notifications + dashboards ----------
  const notifList = await (
    await fetch(`${API}/api/notifications`, { headers })
  ).json();
  check(
    "notifications list + unread count",
    Array.isArray(notifList.data?.notifications) && notifList.data.unreadCount > 0,
    notifList.data?.unreadCount,
  );
  const firstUnread = notifList.data.notifications.find(
    (n: { readAt: string | null }) => !n.readAt,
  );
  if (firstUnread) {
    await fetch(`${API}/api/notifications/${firstUnread.id}/read`, {
      method: "POST",
      headers,
    });
    const after = await (await fetch(`${API}/api/notifications`, { headers })).json();
    check(
      "mark-read decrements unread",
      after.data.unreadCount === notifList.data.unreadCount - 1,
      { before: notifList.data.unreadCount, after: after.data.unreadCount },
    );
  }

  const playerDash = await (
    await fetch(`${API}/api/athletes/me/dashboard`, { headers })
  ).json();
  check(
    "athlete dashboard totals",
    playerDash.data?.totalReceivedPaise >= 500000 && playerDash.data?.fundingRequiredPaise > 0,
    playerDash.data,
  );

  const sponsorDash = await (
    await fetch(`${API}/api/sponsors/me/dashboard`, { headers: sponsorHeaders })
  ).json();
  check(
    "sponsor dashboard aggregations",
    sponsorDash.data?.totalSponsoredPaise >= 500000 &&
      sponsorDash.data?.bySport?.some((r: { name: string }) => r.name === "Cricket"),
    sponsorDash.data,
  );

  // ---------- Supplier catalogue ----------
  // The three properties worth protecting: an unapproved supplier reaches no donor, a
  // supplier cannot touch a competitor's offer, and the cheapest honest price wins the sort.
  const catItem = await prisma.equipmentItem.findFirstOrThrow({
    where: { isActive: true },
    orderBy: { slug: "asc" },
  });

  const browse = await (await fetch(`${API}/api/catalogue?q=${encodeURIComponent(catItem.name.slice(0, 12))}`)).json();
  check("catalogue search finds the item", (browse.meta?.total ?? 0) > 0, browse.meta);

  const bySlug = await (await fetch(`${API}/api/catalogue/${catItem.slug}`)).json();
  check("catalogue resolves by public slug", bySlug.data?.id === catItem.id, bySlug.data?.slug);

  const supUser = await prisma.user.upsert({
    where: { email: "test-supplier@khelkhud.dev" },
    update: { role: "SUPPLIER" },
    create: { email: "test-supplier@khelkhud.dev", name: "Test Supplier", role: "SUPPLIER" },
  });
  const rivalUser = await prisma.user.upsert({
    where: { email: "test-supplier-rival@khelkhud.dev" },
    update: { role: "SUPPLIER" },
    create: { email: "test-supplier-rival@khelkhud.dev", name: "Rival Supplier", role: "SUPPLIER" },
  });
  // Start unapproved every run: the gate is the thing under test, so inheriting canPublish
  // from a previous run would make this assertion pass without proving anything.
  const supProfile = await prisma.supplierProfile.upsert({
    where: { userId: supUser.id },
    update: { canPublish: false, isActive: true },
    create: { userId: supUser.id, name: "Test Supplier Co", canPublish: false },
  });
  await prisma.supplierProfile.upsert({
    where: { userId: rivalUser.id },
    update: { canPublish: true, isActive: true },
    create: { userId: rivalUser.id, name: "Rival Supplier Co", canPublish: true },
  });
  await prisma.supplierOffer.deleteMany({ where: { supplierId: supProfile.id } });

  const supHeaders = {
    cookie: `kk_session=${await signSession({ uid: supUser.id, role: "SUPPLIER" })}`,
    "Content-Type": "application/json",
  };
  const rivalHeaders = {
    cookie: `kk_session=${await signSession({ uid: rivalUser.id, role: "SUPPLIER" })}`,
    "Content-Type": "application/json",
  };
  const offerBody = JSON.stringify({
    equipmentItemId: catItem.id,
    marketplace: "DIRECT",
    url: "https://supplier.example/item",
    pricePaise: Math.round(catItem.indicativePaise * 0.9),
  });

  // An unapproved supplier CAN write an offer — that is the draft catalogue. What must
  // hold is that nobody sees it. Asserting "creation 403s" would test a gate we chose not
  // to have and would pass even if the offer leaked.
  const drafted = await (
    await fetch(`${API}/api/suppliers/me/offers`, { method: "POST", headers: supHeaders, body: offerBody })
  ).json();
  check("unapproved supplier can draft an offer", Boolean(drafted.data?.id), drafted);
  const offerId: string = drafted.data?.id;

  const whileUnapproved = await (await fetch(`${API}/api/catalogue/${catItem.slug}`)).json();
  check(
    "an unapproved supplier's draft reaches no donor",
    !whileUnapproved.data?.offers?.some((o: { id: string }) => o.id === offerId),
    whileUnapproved.data?.offers?.length,
  );

  await prisma.supplierProfile.update({
    where: { id: supProfile.id },
    data: { canPublish: true },
  });
  const seen = await (await fetch(`${API}/api/catalogue/${catItem.slug}`)).json();
  check(
    "approval makes the existing draft visible, with nothing re-entered",
    seen.data?.offers?.some((o: { id: string }) => o.id === offerId),
    seen.data?.offers?.length,
  );

  // Revoking trust must hide the offer without destroying it - an admin withdrawing
  // approval is not the same as a supplier deleting their catalogue.
  await prisma.supplierProfile.update({ where: { id: supProfile.id }, data: { canPublish: false } });
  const hidden = await (await fetch(`${API}/api/catalogue/${catItem.slug}`)).json();
  check(
    "revoking canPublish hides the offer publicly",
    !hidden.data?.offers?.some((o: { id: string }) => o.id === offerId),
    hidden.data?.offers?.length,
  );
  const stillMine = await (await fetch(`${API}/api/suppliers/me`, { headers: supHeaders })).json();
  check(
    "but the supplier still sees their own offer",
    stillMine.data?.offers?.some((o: { id: string }) => o.id === offerId),
    stillMine.data?.offers?.length,
  );

  const crossEdit = await fetch(`${API}/api/suppliers/me/offers/${offerId}`, {
    method: "PATCH",
    headers: rivalHeaders,
    body: JSON.stringify({ pricePaise: 100 }),
  });
  check("a supplier cannot edit a competitor's offer", crossEdit.status === 403, crossEdit.status);
  const ghostEdit = await fetch(`${API}/api/suppliers/me/offers/does-not-exist`, {
    method: "PATCH",
    headers: rivalHeaders,
    body: JSON.stringify({ pricePaise: 100 }),
  });
  // Same status for missing and forbidden, or the API becomes an offer-id oracle.
  check(
    "missing and forbidden are indistinguishable",
    ghostEdit.status === crossEdit.status,
    { ghost: ghostEdit.status, cross: crossEdit.status },
  );

  console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
