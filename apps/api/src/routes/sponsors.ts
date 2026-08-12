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
          player: {
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
