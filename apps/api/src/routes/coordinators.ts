import { Router } from "express";
import { RequestStatus, VerificationStatus } from "@prisma/client";
import { coordinatorRequestCreateSchema, requestValidationSchema } from "@khelkhud/shared";
import type {
  CoordinatorRequestCreateInput,
  RequestItemInput,
  RequestValidationInput,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { assertCatalogueLinks } from "../services/catalogue.service.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import {
  coordinatorQueue,
  decideRequest,
  requireCoordinator,
} from "../services/coordinator.service.js";
import { notify } from "../services/notify.js";

export const coordinatorsRouter: Router = Router();

// ADMIN is allowed through so an admin can see and unblock a coordinator's queue without
// a second implementation. Scope still applies: an admin who is not also a coordinator has
// no CoordinatorProfile, so requireCoordinator rejects them. Admin override lives on the
// admin router, deliberately, rather than being smuggled in here.
coordinatorsRouter.use(requireAuth, requireRole("COORDINATOR", "ADMIN"));

/** Who am I, and which villages do I cover. */
coordinatorsRouter.get("/me", async (req, res, next) => {
  try {
    const profile = await requireCoordinator(req.user!.uid);
    res.json({
      data: {
        id: profile.id,
        designation: profile.designation,
        phone: profile.phone,
        isActive: profile.isActive,
        villages: profile.villages,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Requests waiting on me, plus what I have recently decided. */
coordinatorsRouter.get("/me/queue", async (req, res, next) => {
  try {
    const { profile, pending, recent } = await coordinatorQueue(req.user!.uid);
    res.json({
      data: { pending, recent },
      meta: {
        villages: profile.villages,
        pendingCount: pending.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Raising a request ----------

type CoordinatorScope = Awaited<ReturnType<typeof requireCoordinator>>;

/**
 * The village-shaped half of the scope rule.
 *
 * `assertCoordinatorCovers` is the chokepoint for an EXISTING request, and it works by
 * finding the row inside the coordinator's villages. A request being created has no row to
 * find yet, so the same boundary has to be drawn against the village directly — from the
 * scope `requireCoordinator` already returned, never from anything the client sent.
 */
function assertCoversVillage(profile: CoordinatorScope, villageId: string): void {
  if (!profile.villages.some((v) => v.id === villageId)) {
    throw new ApiError(403, "OUT_OF_AREA", "That village is not one of yours");
  }
}

/** Never trust a client-sent total: it is a number nobody has checked against the items. */
function totalEstimatedPaise(items: RequestItemInput[]): number {
  return items.reduce((sum, i) => sum + i.estimatedPaise * i.quantity, 0);
}

/**
 * Raise a request, already validated.
 *
 * The whole of docs/architecture/v2-village-model.md section 2 in one handler: the
 * coordinator IS the validator, so their own request opens on arrival rather than joining
 * a queue they would then approve themselves. `notifyValidators` is deliberately NOT called
 * — there is nobody left to tell.
 *
 * What that speed costs is auditability, so it is bought back: `validatedById` names their
 * profile, and a VerificationRecord names the human, which is what lets an admin revoke a
 * coordinator later and see everything they vouched for.
 */
coordinatorsRouter.post(
  "/me/requests",
  validate(coordinatorRequestCreateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as CoordinatorRequestCreateInput;
      const profile = await requireCoordinator(req.user!.uid);
      assertCoversVillage(profile, body.villageId);

      // The beneficiary must be IN that village, not merely exist. Checking only the
      // village would let a coordinator vouch for an athlete three districts away by
      // filing them under a village they do cover — which is precisely the thing the
      // scope rule exists to prevent.
      const athlete = body.athleteId
        ? await prisma.athleteProfile.findFirst({
            where: { id: body.athleteId, locationId: body.villageId },
            include: { user: { select: { id: true, name: true } } },
          })
        : null;
      const institution = body.institutionId
        ? await prisma.institution.findFirst({
            where: { id: body.institutionId, villageId: body.villageId },
          })
        : null;
      if (!athlete && !institution) {
        throw new ApiError(
          400,
          "BENEFICIARY_NOT_IN_VILLAGE",
          "That athlete or place is not in the village you picked. You can only raise a request for someone in your own villages.",
        );
      }

      await assertCatalogueLinks(body.kind, body.items);

      const now = new Date();
      const who = athlete?.user.name ?? institution!.name;

      const request = await prisma.$transaction(async (tx) => {
        const created = await tx.request.create({
          data: {
            kind: body.kind,
            title: body.title,
            description: body.description ?? null,
            villageId: body.villageId,
            athleteId: athlete?.id ?? null,
            institutionId: institution?.id ?? null,
            raisedById: req.user!.uid,
            // No second queue. See section 2: the coordinator is the trust anchor, and a
            // request they raised is one they have already vouched for by raising it.
            status: RequestStatus.OPEN,
            validatedById: profile.id,
            validatedAt: now,
            totalEstimatedPaise: totalEstimatedPaise(body.items),
            deadline: body.deadline ? new Date(body.deadline) : null,
            items: {
              create: body.items.map((i) => ({
                label: i.label,
                quantity: i.quantity,
                estimatedPaise: i.estimatedPaise,
                note: i.note ?? null,
                equipmentItemId: i.equipmentItemId ?? null,
              })),
            },
          },
          include: { items: true, village: { select: { id: true, name: true } } },
        });

        // Same vouching as decideRequest: a coordinator asking on an athlete's behalf is
        // the strongest statement they can make that the athlete is real and local, and it
        // would be incoherent to record VERIFIED here while the profile stayed PENDING.
        // Only ever upgrades a PENDING profile — it must not resurrect one an admin
        // rejected.
        if (athlete) {
          await tx.athleteProfile.updateMany({
            where: { id: athlete.id, verificationStatus: VerificationStatus.PENDING },
            data: { verificationStatus: VerificationStatus.VERIFIED, verifiedAt: now },
          });
        }

        // The audit row is the price of skipping the queue. It names the reviewer, so
        // revoking a coordinator later means being able to list everything they opened.
        // An institution beneficiary has no subject column to point at — the note carries
        // the request instead, rather than the row being skipped.
        await tx.verificationRecord.create({
          data: {
            subjectAthleteId: athlete?.id ?? null,
            reviewerUserId: req.user!.uid,
            decision: VerificationStatus.VERIFIED,
            note: `Raised and self-validated request "${created.title}" (${created.id}) for ${who} by ${profile.designation}`,
          },
        });

        return created;
      });

      // Someone should not find out by accident that there is a public fundraising request
      // about them. Skipped when the coordinator is the beneficiary — telling them what
      // they just did is noise.
      const beneficiaryUserId = athlete?.user.id;
      if (beneficiaryUserId && beneficiaryUserId !== req.user!.uid) {
        // VERIFICATION_RESULT, matching decideRequest: from the athlete's side this is the
        // same event — their request is live and a coordinator vouched for it. Section 6's
        // REQUEST_VALIDATED does not exist in the enum yet and adding it is a migration.
        void notify(beneficiaryUserId, "VERIFICATION_RESULT", {
          title: "A request was raised for you, and it is already live",
          body: `${profile.designation} raised "${request.title}" on your behalf in ${request.village.name}. Because a coordinator raised it, it is validated already and sponsors can see it now.`,
          linkUrl: "/dashboard/athlete/requests",
        });
      }

      res.status(201).json({ data: request });
    } catch (err) {
      next(err);
    }
  },
);

/** What I have raised myself — so the form has somewhere to land after posting. */
coordinatorsRouter.get("/me/requests", async (req, res, next) => {
  try {
    await requireCoordinator(req.user!.uid);
    const requests = await prisma.request.findMany({
      // By raiser, not by village: these are the ones this person put their name to, which
      // is a different list from "everything happening in my villages" (that is the queue).
      where: { raisedById: req.user!.uid },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        athlete: { include: { user: { select: { name: true } } } },
        institution: { select: { id: true, name: true, kind: true } },
        village: { select: { id: true, name: true, displayPath: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ data: requests });
  } catch (err) {
    next(err);
  }
});

/**
 * Approve or reject. Approval opens the request to sponsors immediately — there is no
 * admin step, which is the whole reason the role exists.
 */
coordinatorsRouter.post(
  "/requests/:id/decide",
  validate(requestValidationSchema),
  async (req, res, next) => {
    try {
      const { decision, note } = req.body as RequestValidationInput;
      const updated = await decideRequest({
        coordinatorUserId: req.user!.uid,
        requestId: String(req.params.id),
        decision,
        note,
      });
      res.json({ data: { id: updated.id, status: updated.status } });
    } catch (err) {
      next(err);
    }
  },
);
