import { RequestStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errors.js";
import { notify } from "./notify.js";

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
