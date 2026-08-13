import { Router } from "express";
import { institutionCreateSchema, institutionUpdateSchema } from "@khelkhud/shared";
import type { InstitutionCreateInput, InstitutionUpdateInput } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { requireCoordinator } from "../services/coordinator.service.js";

export const institutionsRouter: Router = Router();

/**
 * Institutions: schools, grounds, clubs.
 *
 * Created by the coordinator who covers the village, not by anyone who asks. The same
 * scope rule as everything else the coordinator does — a coordinator in Nizamabad has no
 * business registering a school in Sangareddy — and it is enforced here rather than
 * trusted to the caller.
 */

/** Public: anyone can see what a village has. Needed to browse requests by beneficiary. */
institutionsRouter.get("/", async (req, res, next) => {
  try {
    const villageId = typeof req.query.villageId === "string" ? req.query.villageId : undefined;
    const rows = await prisma.institution.findMany({
      where: villageId ? { villageId } : undefined,
      include: {
        village: { select: { id: true, name: true, displayPath: true } },
        _count: { select: { requests: true } },
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

institutionsRouter.post(
  "/",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  validate(institutionCreateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as InstitutionCreateInput;

      // Admins are unscoped by design; a coordinator is confined to their own villages.
      if (req.user!.role === "COORDINATOR") {
        const profile = await requireCoordinator(req.user!.uid);
        const covers = profile.villages.some((v) => v.id === body.villageId);
        if (!covers) {
          throw new ApiError(
            403,
            "OUT_OF_AREA",
            "That village is not one of yours",
          );
        }
      }

      const village = await prisma.location.findFirst({
        where: { id: body.villageId, level: "VILLAGE" },
      });
      if (!village) {
        throw new ApiError(400, "INVALID_VILLAGE", "That is not a village");
      }

      // Same name in the same village is almost certainly a duplicate rather than a second
      // school — and a duplicate splits its requests across two records.
      const clash = await prisma.institution.findFirst({
        where: { villageId: body.villageId, name: { equals: body.name, mode: "insensitive" } },
      });
      if (clash) {
        throw new ApiError(
          409,
          "ALREADY_EXISTS",
          `${body.name} is already registered in ${village.name}`,
        );
      }

      const created = await prisma.institution.create({
        data: {
          villageId: body.villageId,
          kind: body.kind,
          name: body.name,
          description: body.description ?? null,
          // The coordinator who registered it is its custodian: equipment gets delivered
          // to a person, and this is who that is.
          custodianId: req.user!.uid,
        },
        include: { village: { select: { id: true, name: true, displayPath: true } } },
      });
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  },
);

institutionsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("COORDINATOR", "ADMIN"),
  validate(institutionUpdateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as InstitutionUpdateInput;
      const existing = await prisma.institution.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Institution not found");

      if (req.user!.role === "COORDINATOR") {
        const profile = await requireCoordinator(req.user!.uid);
        if (!profile.villages.some((v) => v.id === existing.villageId)) {
          throw new ApiError(403, "OUT_OF_AREA", "That institution is not in one of your villages");
        }
      }

      const updated = await prisma.institution.update({
        where: { id: existing.id },
        data: body,
        include: { village: { select: { id: true, name: true, displayPath: true } } },
      });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);
