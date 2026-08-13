import { Router } from "express";
import { sponsorProfileUpdateSchema } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";

export const sponsorsRouter: Router = Router();

sponsorsRouter.get("/me", requireAuth, requireRole("SPONSOR"), async (req, res, next) => {
  try {
    const profile = await prisma.sponsorProfile.findUnique({
      where: { userId: req.user!.uid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        location: true,
        preferredSports: { select: { id: true, name: true } },
      },
    });
    if (!profile) throw new ApiError(404, "NO_PROFILE", "Sponsor profile not found");
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

sponsorsRouter.get(
  "/me/dashboard",
  requireAuth,
  requireRole("SPONSOR"),
  async (req, res, next) => {
    try {
      const profile = await prisma.sponsorProfile.findUnique({ where: { userId: req.user!.uid } });
      if (!profile) throw new ApiError(404, "NO_PROFILE", "Sponsor profile not found");

      const paid = await prisma.sponsorship.findMany({
        where: { sponsorId: profile.id, paymentStatus: "PAID" },
        include: {
          athlete: {
            include: {
              user: { select: { name: true, avatarUrl: true } },
              sport: { select: { name: true } },
              location: { select: { id: true, name: true } },
            },
          },
        },
      });

      const totalSponsoredPaise = paid.reduce((s, x) => s + x.amountPaise, 0);
      const athletesSupported = new Set(paid.map((s) => s.athleteId)).size;
      const active = paid.filter((s) => s.status === "ACTIVE").length;
      const completed = paid.filter((s) => s.status === "COMPLETED").length;
      const utilizationCompleted = paid.filter(
        (s) => s.utilizationStatus === "COMPLETED",
      ).length;

      const bySport = new Map<string, number>();
      const byLocation = new Map<string, number>();
      for (const s of paid) {
        const sport = s.athlete.sport?.name ?? "Unassigned";
        bySport.set(sport, (bySport.get(sport) ?? 0) + s.amountPaise);
        const loc = s.athlete.location?.name ?? "Unknown";
        byLocation.set(loc, (byLocation.get(loc) ?? 0) + s.amountPaise);
      }

      res.json({
        data: {
          totalSponsoredPaise,
          athletesSupported,
          activeSponsorships: active,
          completedSponsorships: completed,
          utilizationCompleted,
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
  },
);

sponsorsRouter.get(
  "/me/sponsorships",
  requireAuth,
  requireRole("SPONSOR"),
  async (req, res, next) => {
    try {
      const profile = await prisma.sponsorProfile.findUnique({ where: { userId: req.user!.uid } });
      if (!profile) throw new ApiError(404, "NO_PROFILE", "Sponsor profile not found");
      const sponsorships = await prisma.sponsorship.findMany({
        where: { sponsorId: profile.id },
        include: {
          athlete: {
            include: { user: { select: { name: true, avatarUrl: true } }, sport: true },
          },
          updates: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: sponsorships });
    } catch (err) {
      next(err);
    }
  },
);

sponsorsRouter.put(
  "/me",
  requireAuth,
  requireRole("SPONSOR"),
  validate(sponsorProfileUpdateSchema),
  async (req, res, next) => {
    try {
      const profile = await prisma.sponsorProfile.findUnique({
        where: { userId: req.user!.uid },
      });
      if (!profile) throw new ApiError(404, "NO_PROFILE", "Sponsor profile not found");
      const { preferredSportIds, ...rest } = req.body;
      const updated = await prisma.sponsorProfile.update({
        where: { id: profile.id },
        data: {
          ...rest,
          ...(preferredSportIds
            ? { preferredSports: { set: preferredSportIds.map((id: string) => ({ id })) } }
            : {}),
        },
        include: { preferredSports: { select: { id: true, name: true } } },
      });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);
