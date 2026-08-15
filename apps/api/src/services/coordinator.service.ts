import { RequestStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";
import { notify, notifyMany } from "./notify.js";

/**
 * Coordinator authority.
 *
 * The single rule this file exists to enforce: **a coordinator may only act inside the
 * villages assigned to them.** The schema models the boundary (CoordinatorProfile has a
 * many-to-many to Location); this is where it becomes true at runtime.
 *
 * Every path goes through `assertCoordinatorCovers`. Do not query Request directly from a
 * route and act on it — that is how a coordinator in Nizamabad ends up validating an
 * athlete in Sangareddy, and the failure is silent because nothing crashes.
 */

/** The coordinator profile for a user, with their village scope. Throws if not one. */
export async function requireCoordinator(userId: string) {
  const profile = await prisma.coordinatorProfile.findUnique({
    where: { userId },
    include: { villages: { select: { id: true, name: true, displayPath: true } } },
  });
  if (!profile) {
    throw new ApiError(403, "NOT_A_COORDINATOR", "You are not a village coordinator");
  }
  if (!profile.isActive) {
    throw new ApiError(403, "COORDINATOR_INACTIVE", "This coordinator account is inactive");
  }
  return profile;
}

/**
 * Refuse anything outside the coordinator's villages.
 *
 * Deliberately returns the same 403 whether the request is out of scope or does not exist:
 * a distinguishable "not found" would let any coordinator enumerate requests across the
 * whole state by id.
 */
export async function assertCoordinatorCovers(
  coordinatorUserId: string,
  requestId: string,
) {
  const profile = await requireCoordinator(coordinatorUserId);
  const villageIds = profile.villages.map((v) => v.id);

  const request = await prisma.request.findFirst({
    where: { id: requestId, villageId: { in: villageIds } },
    include: {
      athlete: { include: { user: { select: { id: true, name: true } } } },
      institution: true,
      items: true,
      village: { select: { id: true, name: true, displayPath: true } },
    },
  });
  if (!request) {
    throw new ApiError(
      403,
      "OUT_OF_AREA",
      "That request is not in one of your villages",
    );
  }
  return { profile, request };
}

/** Requests awaiting this coordinator, newest first. Only their villages, by construction. */
export async function coordinatorQueue(userId: string) {
  const profile = await requireCoordinator(userId);
  const villageIds = profile.villages.map((v) => v.id);

  const [pending, recent] = await Promise.all([
    prisma.request.findMany({
      where: { villageId: { in: villageIds }, status: RequestStatus.PENDING_VALIDATION },
      include: {
        athlete: { include: { user: { select: { name: true } }, sport: true } },
        institution: true,
        items: true,
        village: { select: { name: true, displayPath: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.request.findMany({
      where: {
        villageId: { in: villageIds },
        status: { not: RequestStatus.PENDING_VALIDATION },
      },
      include: {
        athlete: { include: { user: { select: { name: true } } } },
        institution: true,
        village: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return { profile, pending, recent };
}

/**
 * Approve or reject a request.
 *
 * Approval opens it to sponsors immediately — no admin queue, which is the entire reason
 * the role exists. The decision is written to VerificationRecord naming the coordinator,
 * so delegated trust stays auditable and an admin can revoke later.
 */
export async function decideRequest(input: {
  coordinatorUserId: string;
  requestId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}) {
  const { profile, request } = await assertCoordinatorCovers(
    input.coordinatorUserId,
    input.requestId,
  );

  if (request.status !== RequestStatus.PENDING_VALIDATION) {
    throw new ApiError(
      409,
      "ALREADY_DECIDED",
      `This request is already ${request.status.toLowerCase().replace(/_/g, " ")}`,
    );
  }

  const approved = input.decision === "APPROVE";

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.request.update({
      where: { id: request.id },
      data: {
        status: approved ? RequestStatus.OPEN : RequestStatus.REJECTED,
        validatedById: profile.id,
        validatedAt: new Date(),
        rejectionNote: approved ? null : (input.note ?? null),
      },
    });

    // An athlete-beneficiary request being approved also vouches for the athlete: the
    // coordinator has just confirmed they are who they say they are, which is the whole
    // point of a local validator. Only ever upgrades a PENDING profile — it must not
    // silently resurrect one an admin has rejected.
    if (approved && request.athleteId) {
      await tx.athleteProfile.updateMany({
        where: { id: request.athleteId, verificationStatus: VerificationStatus.PENDING },
        data: { verificationStatus: VerificationStatus.VERIFIED, verifiedAt: new Date() },
      });
      await tx.verificationRecord.create({
        data: {
          subjectAthleteId: request.athleteId,
          reviewerUserId: input.coordinatorUserId,
          decision: VerificationStatus.VERIFIED,
          note: `Validated with request "${request.title}" by ${profile.designation}`,
        },
      });
    }
    return r;
  });

  const beneficiaryUserId = request.athlete?.user.id;
  if (beneficiaryUserId) {
    await notify(
      beneficiaryUserId,
      approved ? "VERIFICATION_RESULT" : "INFO_REQUESTED",
      {
        title: approved ? "Your request is live" : "Your request needs changes",
        body: approved
          ? `"${request.title}" was validated by ${profile.designation} and is now visible to sponsors.`
          : `"${request.title}" was not approved. ${input.note ?? ""}`.trim(),
        linkUrl: "/dashboard/athlete/requests",
      },
    );
  }

  return updated;
}

/**
 * The orphan problem.
 *
 * An athlete can raise a request in a village that has no coordinator. It lands in
 * PENDING_VALIDATION and there is, structurally, nobody who can approve it: every
 * decision path above is gated on a CoordinatorProfile covering that village. The athlete
 * is told "waiting on your coordinator" and waits forever.
 *
 * So admins are the fallback — but ONLY where no active coordinator exists. If one does,
 * their judgement stands; central override would quietly hollow out the role the whole
 * model is built on. That is the difference between a safety net and a bypass.
 */

/** Villages with no active coordinator have no route to approval. This finds their backlog. */
export async function orphanedRequestQueue() {
  const where = {
    status: RequestStatus.PENDING_VALIDATION,
    village: { coordinators: { none: { isActive: true } } },
  } as const;

  const [pending, villagesAwaiting] = await Promise.all([
    prisma.request.findMany({
      where,
      include: {
        athlete: { include: { user: { select: { name: true } }, sport: true } },
        institution: true,
        items: true,
        village: { select: { id: true, name: true, displayPath: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    // Surfaced separately so an admin can see WHERE to appoint someone, rather than
    // inferring it from a request list. Clearing the backlog is treating the symptom;
    // appointing a coordinator is the fix.
    prisma.location.findMany({
      where: { level: "VILLAGE", coordinators: { none: { isActive: true } }, requests: { some: {} } },
      select: {
        id: true,
        name: true,
        displayPath: true,
        _count: { select: { requests: true, athleteProfiles: true } },
      },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  return { pending, villagesAwaiting };
}

/**
 * Admin decides a request in an uncovered village.
 *
 * `validatedById` stays null on purpose: it points at a CoordinatorProfile and there is no
 * honest value to put there. Null means "validated, but not by someone local" — and the
 * public surfaces say so, because a sponsor deciding whether to trust an ask deserves to
 * know a village neighbour did not vouch for it.
 */
export async function decideRequestAsAdmin(input: {
  adminUserId: string;
  requestId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}) {
  const request = await prisma.request.findUnique({
    where: { id: input.requestId },
    include: {
      athlete: { include: { user: { select: { id: true } } } },
      village: { include: { coordinators: { where: { isActive: true }, select: { id: true } } } },
    },
  });
  if (!request) throw new ApiError(404, "NOT_FOUND", "Request not found");

  if (request.village.coordinators.length > 0) {
    throw new ApiError(
      409,
      "HAS_COORDINATOR",
      "This village has a coordinator. Their decision stands — appoint or deactivate them instead of overriding.",
    );
  }

  if (request.status !== RequestStatus.PENDING_VALIDATION) {
    throw new ApiError(
      409,
      "ALREADY_DECIDED",
      `This request is already ${request.status.toLowerCase().replace(/_/g, " ")}`,
    );
  }

  const approved = input.decision === "APPROVE";

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.request.update({
      where: { id: request.id },
      data: {
        status: approved ? RequestStatus.OPEN : RequestStatus.REJECTED,
        validatedAt: new Date(),
        rejectionNote: approved ? null : (input.note ?? null),
      },
    });

    // Deliberately NOT auto-verifying the athlete. A coordinator approving is a neighbour
    // saying "I know this person"; an admin approving from a spreadsheet is not, and
    // minting a VERIFIED badge off it would cash a cheque nobody wrote.
    if (approved && request.athleteId) {
      await tx.verificationRecord.create({
        data: {
          subjectAthleteId: request.athleteId,
          reviewerUserId: input.adminUserId,
          decision: VerificationStatus.PENDING,
          note: `Request "${request.title}" opened centrally — no coordinator covers ${request.village.name}. Identity not vouched for locally.`,
        },
      });
    }
    return r;
  });

  const beneficiaryUserId = request.athlete?.user.id;
  if (beneficiaryUserId) {
    await notify(
      beneficiaryUserId,
      approved ? "VERIFICATION_RESULT" : "INFO_REQUESTED",
      {
        title: approved ? "Your request is live" : "Your request needs changes",
        body: approved
          ? `"${request.title}" was reviewed by khelkhud and is now visible to sponsors. There is no coordinator in ${request.village.name} yet.`
          : `"${request.title}" was not approved. ${input.note ?? ""}`.trim(),
        linkUrl: "/dashboard/athlete/requests",
      },
    );
  }

  return updated;
}

/**
 * Tell whoever must validate a new request that it is waiting.
 *
 * Without this a coordinator only discovers work by opening the dashboard. In a village
 * where the coordinator is a PET teacher who checks the site weekly, an athlete waits a
 * week for a decision that takes ten seconds.
 *
 * Routes to the village's active coordinators, or to admins when it has none — matching
 * who actually holds the authority to decide it (see decideRequestAsAdmin). Never throws:
 * failing to send a notification must not fail the request that triggered it.
 */
export async function notifyValidators(requestId: string): Promise<void> {
  try {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        village: {
          include: {
            coordinators: {
              where: { isActive: true },
              select: { userId: true },
            },
          },
        },
        athlete: { include: { user: { select: { name: true } } } },
        institution: { select: { name: true } },
      },
    });
    if (!request) return;

    const who = request.athlete?.user.name ?? request.institution?.name ?? "Someone";
    const village = request.village.name;
    const coordinatorUserIds = request.village.coordinators.map((c) => c.userId);

    if (coordinatorUserIds.length > 0) {
      await notifyMany(coordinatorUserIds, "REQUEST_SUBMITTED", {
        title: `${who} raised a request in ${village}`,
        body: `"${request.title}" is waiting for you to validate it. Approving makes it visible to sponsors immediately.`,
        linkUrl: "/dashboard/coordinator",
      });
      return;
    }

    // No coordinator: the request is unapprovable by anyone except an admin, so tell them
    // rather than letting it sit in a queue nobody is watching.
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    await notifyMany(
      admins.map((a) => a.id),
      "REQUEST_SUBMITTED",
      {
        title: `${who} raised a request in ${village}, which has no coordinator`,
        body: `"${request.title}" cannot be validated locally. Appoint a coordinator for ${village}, or open it centrally.`,
        linkUrl: "/admin/requests",
      },
    );
  } catch (err) {
    logger.error({ err, requestId }, "Failed to notify validators");
  }
}
