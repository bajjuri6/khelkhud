import { Router } from "express";
import {
  locationCreateSchema,
  locationUpdateSchema,
  sportCreateSchema,
  sportUpdateSchema,
  verificationDecisionSchema,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import { notify } from "../services/notify.js";

export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

function pagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Number(query.pageSize) || 20);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// ---------- Stats ----------

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [
      totalAthletes,
      verifiedAthletes,
      totalSponsors,
      verifiedSponsors,
      totalSponsorships,
      activeSponsorships,
      completedSponsorships,
      paidAggregate,
      pendingVerifications,
    ] = await Promise.all([
      prisma.athleteProfile.count(),
      prisma.athleteProfile.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.sponsorProfile.count(),
      prisma.sponsorProfile.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.sponsorship.count({ where: { paymentStatus: "PAID" } }),
      prisma.sponsorship.count({ where: { paymentStatus: "PAID", status: "ACTIVE" } }),
      prisma.sponsorship.count({ where: { status: "COMPLETED" } }),
      prisma.sponsorship.aggregate({
        where: { paymentStatus: "PAID" },
        _sum: { amountPaise: true },
      }),
      prisma.athleteProfile.count({
        where: { verificationStatus: { in: ["PENDING", "INFO_REQUESTED"] } },
      }),
    ]);

    // ₹ by sport across paid sponsorships
    const paid = await prisma.sponsorship.findMany({
      where: { paymentStatus: "PAID" },
      include: {
        athlete: {
          select: { sport: { select: { name: true } }, locationId: true },
        },
      },
    });
    const locations = await prisma.location.findMany({
      select: { id: true, name: true, parentId: true },
    });
    const locationById = new Map(locations.map((l) => [l.id, l]));
    const bySport = new Map<string, number>();
    const byLocation = new Map<string, number>();
    for (const s of paid) {
      const sport = s.athlete.sport?.name ?? "Unassigned";
      bySport.set(sport, (bySport.get(sport) ?? 0) + s.amountPaise);
      const city = s.athlete.locationId ? locationById.get(s.athlete.locationId) : undefined;
      const cityName = city?.name ?? "Unknown";
      byLocation.set(cityName, (byLocation.get(cityName) ?? 0) + s.amountPaise);
    }

    res.json({
      data: {
        totalAthletes,
        verifiedAthletes,
        totalSponsors,
        verifiedSponsors,
        totalSponsorships,
        activeSponsorships,
        completedSponsorships,
        totalSponsoredPaise: paidAggregate._sum.amountPaise ?? 0,
        pendingVerifications,
        bySport: [...bySport.entries()]
          .map(([name, amountPaise]) => ({ name, amountPaise }))
          .sort((a, b) => b.amountPaise - a.amountPaise),
        byLocation: [...byLocation.entries()]
          .map(([name, amountPaise]) => ({ name, amountPaise }))
          .sort((a, b) => b.amountPaise - a.amountPaise),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Verification queue ----------

adminRouter.get("/verifications", async (req, res, next) => {
  try {
    const statusFilter =
      typeof req.query.status === "string" &&
      ["PENDING", "VERIFIED", "REJECTED", "INFO_REQUESTED"].includes(req.query.status)
        ? (req.query.status as "PENDING" | "VERIFIED" | "REJECTED" | "INFO_REQUESTED")
        : undefined;
    const where = {
      verificationStatus:
        statusFilter ?? { in: ["PENDING", "INFO_REQUESTED"] as ("PENDING" | "INFO_REQUESTED")[] },
    };

    const [athletes, sponsors] = await Promise.all([
      prisma.athleteProfile.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
          sport: { select: { name: true } },
          documents: { select: { id: true, fileName: true, kind: true } },
          verificationRecords: { orderBy: { createdAt: "desc" }, take: 3 },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.sponsorProfile.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
          documents: { select: { id: true, fileName: true, kind: true } },
          verificationRecords: { orderBy: { createdAt: "desc" }, take: 3 },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    res.json({ data: { athletes, sponsors } });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/verifications/:profileType/:id",
  validate(verificationDecisionSchema),
  async (req, res, next) => {
    try {
      const profileType = String(req.params.profileType);
      const id = String(req.params.id);
      const { decision, note } = req.body as {
        decision: "VERIFIED" | "REJECTED" | "INFO_REQUESTED";
        note?: string | null;
      };
      if (profileType !== "athlete" && profileType !== "sponsor") {
        throw new ApiError(400, "VALIDATION", "profileType must be athlete or sponsor");
      }

      let userId: string;
      if (profileType === "athlete") {
        const profile = await prisma.athleteProfile.findUnique({ where: { id } });
        if (!profile) throw new ApiError(404, "NOT_FOUND", "Athlete profile not found");
        await prisma.$transaction([
          prisma.athleteProfile.update({
            where: { id },
            data: {
              verificationStatus: decision,
              verifiedAt: decision === "VERIFIED" ? new Date() : null,
            },
          }),
          prisma.verificationRecord.create({
            data: {
              subjectAthleteId: id,
              reviewerUserId: req.user!.uid,
              decision,
              note: note ?? null,
            },
          }),
        ]);
        userId = profile.userId;
      } else {
        const profile = await prisma.sponsorProfile.findUnique({ where: { id } });
        if (!profile) throw new ApiError(404, "NOT_FOUND", "Sponsor profile not found");
        await prisma.$transaction([
          prisma.sponsorProfile.update({
            where: { id },
            data: {
              verificationStatus: decision,
              verifiedAt: decision === "VERIFIED" ? new Date() : null,
            },
          }),
          prisma.verificationRecord.create({
            data: {
              subjectSponsorId: id,
              reviewerUserId: req.user!.uid,
              decision,
              note: note ?? null,
            },
          }),
        ]);
        userId = profile.userId;
      }

      const messages = {
        VERIFIED: {
          title: "Your profile has been verified ✓",
          body: "Your khelkhud profile is now verified and displays a verification badge.",
        },
        REJECTED: {
          title: "Your profile verification was rejected",
          body: note ? `Reason: ${note}` : "Contact support for details.",
        },
        INFO_REQUESTED: {
          title: "More information needed for verification",
          body: note ?? "Please upload additional documents to your profile.",
        },
      } as const;
      await notify(
        userId,
        decision === "INFO_REQUESTED" ? "INFO_REQUESTED" : "VERIFICATION_RESULT",
        messages[decision],
      );

      res.json({ data: { ok: true, decision } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Monitors ----------

adminRouter.get("/athletes", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pagination(req.query as Record<string, unknown>);
    const [total, rows] = await prisma.$transaction([
      prisma.athleteProfile.count(),
      prisma.athleteProfile.findMany({
        include: {
          user: { select: { name: true, email: true, isActive: true } },
          sport: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data: rows, meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/sponsors", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pagination(req.query as Record<string, unknown>);
    const [total, rows] = await prisma.$transaction([
      prisma.sponsorProfile.count(),
      prisma.sponsorProfile.findMany({
        include: { user: { select: { name: true, email: true, isActive: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data: rows, meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/sponsorships", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pagination(req.query as Record<string, unknown>);
    const [total, rows] = await prisma.$transaction([
      prisma.sponsorship.count(),
      prisma.sponsorship.findMany({
        include: {
          athlete: { include: { user: { select: { name: true } } } },
          sponsor: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data: rows, meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/transactions", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = pagination(req.query as Record<string, unknown>);
    const [total, rows] = await prisma.$transaction([
      prisma.transaction.count(),
      prisma.transaction.findMany({
        include: { sponsorship: { select: { code: true } } },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({ data: rows, meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

// ---------- Sports & locations management ----------

adminRouter.post("/sports", validate(sportCreateSchema), async (req, res, next) => {
  try {
    const name = (req.body.name as string).trim();
    const sport = await prisma.sport.create({
      data: { name, slug: name.toLowerCase().replace(/\s+/g, "-") },
    });
    res.status(201).json({ data: sport });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/sports/:id", validate(sportUpdateSchema), async (req, res, next) => {
  try {
    const sport = await prisma.sport.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json({ data: sport });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/locations", validate(locationCreateSchema), async (req, res, next) => {
  try {
    const { name, level, parentId } = req.body;
    if (level !== "STATE" && !parentId) {
      throw new ApiError(400, "VALIDATION", "District/city needs a parent location");
    }
    const location = await prisma.location.create({
      data: { name: name.trim(), level, parentId: parentId ?? null },
    });
    res.status(201).json({ data: location });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/locations/:id", validate(locationUpdateSchema), async (req, res, next) => {
  try {
    const location = await prisma.location.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json({ data: location });
  } catch (err) {
    next(err);
  }
});
