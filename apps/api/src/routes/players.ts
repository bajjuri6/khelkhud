import { Router } from "express";
import {
  achievementSchema,
  eventSchema,
  playerProfileUpdateSchema,
  requirementCreateSchema,
  requirementUpdateSchema,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";

export const playersRouter: Router = Router();

async function myProfile(uid: string) {
  const profile = await prisma.playerProfile.findUnique({ where: { userId: uid } });
  if (!profile) throw new ApiError(404, "NO_PROFILE", "Player profile not found");
  return profile;
}

/** Age in whole years, so date of birth stays private. */
function toAge(dob: Date | null): number | null {
  if (!dob) return null;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

async function locationChain(locationId: string | null): Promise<string | null> {
  if (!locationId) return null;
  const parts: string[] = [];
  let current = await prisma.location.findUnique({ where: { id: locationId } });
  while (current) {
    parts.push(current.name);
    current = current.parentId
      ? await prisma.location.findUnique({ where: { id: current.parentId } })
      : null;
  }
  return parts.join(", ");
}

// ---------- Own profile (PLAYER) ----------

playersRouter.get("/me", requireAuth, requireRole("PLAYER"), async (req, res, next) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.user!.uid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        sport: true,
        location: true,
        achievements: { orderBy: [{ year: "desc" }, { createdAt: "desc" }] },
        events: { orderBy: { date: "asc" } },
        requirements: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!profile) throw new ApiError(404, "NO_PROFILE", "Player profile not found");
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

playersRouter.put(
  "/me",
  requireAuth,
  requireRole("PLAYER"),
  validate(playerProfileUpdateSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const { dateOfBirth, ...rest } = req.body;
      const updated = await prisma.playerProfile.update({
        where: { id: profile.id },
        data: {
          ...rest,
          ...(dateOfBirth !== undefined
            ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
            : {}),
        },
      });
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Achievements ----------

playersRouter.post(
  "/me/achievements",
  requireAuth,
  requireRole("PLAYER"),
  validate(achievementSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const achievement = await prisma.achievement.create({
        data: { ...req.body, playerId: profile.id },
      });
      res.status(201).json({ data: achievement });
    } catch (err) {
      next(err);
    }
  },
);

playersRouter.put(
  "/me/achievements/:id",
  requireAuth,
  requireRole("PLAYER"),
  validate(achievementSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.achievement.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.playerId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Achievement not found");
      }
      const achievement = await prisma.achievement.update({
        where: { id: existing.id },
        data: req.body,
      });
      res.json({ data: achievement });
    } catch (err) {
      next(err);
    }
  },
);

playersRouter.delete(
  "/me/achievements/:id",
  requireAuth,
  requireRole("PLAYER"),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.achievement.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.playerId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Achievement not found");
      }
      await prisma.achievement.delete({ where: { id: existing.id } });
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Events ----------

playersRouter.post(
  "/me/events",
  requireAuth,
  requireRole("PLAYER"),
  validate(eventSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const { date, ...rest } = req.body;
      const event = await prisma.event.create({
        data: { ...rest, date: date ? new Date(date) : null, playerId: profile.id },
      });
      res.status(201).json({ data: event });
    } catch (err) {
      next(err);
    }
  },
);

playersRouter.put(
  "/me/events/:id",
  requireAuth,
  requireRole("PLAYER"),
  validate(eventSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.playerId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Event not found");
      }
      const { date, ...rest } = req.body;
      const event = await prisma.event.update({
        where: { id: existing.id },
        data: { ...rest, date: date ? new Date(date) : null },
      });
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  },
);

playersRouter.delete(
  "/me/events/:id",
  requireAuth,
  requireRole("PLAYER"),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.playerId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Event not found");
      }
      await prisma.event.delete({ where: { id: existing.id } });
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Requirements ----------

playersRouter.post(
  "/me/requirements",
  requireAuth,
  requireRole("PLAYER"),
  validate(requirementCreateSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const { deadline, ...rest } = req.body;
      const requirement = await prisma.sponsorshipRequirement.create({
        data: { ...rest, deadline: deadline ? new Date(deadline) : null, playerId: profile.id },
      });
      res.status(201).json({ data: requirement });
    } catch (err) {
      next(err);
    }
  },
);

playersRouter.put(
  "/me/requirements/:id",
  requireAuth,
  requireRole("PLAYER"),
  validate(requirementUpdateSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.sponsorshipRequirement.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing || existing.playerId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Requirement not found");
      }
      const { deadline, ...rest } = req.body;
      const requirement = await prisma.sponsorshipRequirement.update({
        where: { id: existing.id },
        data: {
          ...rest,
          ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
        },
      });
      res.json({ data: requirement });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Public profile ----------

playersRouter.get("/:id", async (req, res, next) => {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: { select: { name: true, avatarUrl: true, isActive: true } },
        sport: { select: { id: true, name: true, slug: true } },
        location: { select: { id: true, name: true, level: true, parentId: true } },
        achievements: { orderBy: [{ year: "desc" }, { createdAt: "desc" }] },
        events: { orderBy: { date: "asc" } },
        requirements: {
          where: { status: { in: ["OPEN", "PARTIALLY_FUNDED", "FULLY_FUNDED"] } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!profile || !profile.user.isActive) {
      throw new ApiError(404, "NOT_FOUND", "Player not found");
    }
    const locationLabel = await locationChain(profile.locationId);
    res.json({
      data: {
        id: profile.id,
        name: profile.user.name,
        avatarUrl: profile.user.avatarUrl,
        photoKey: profile.photoKey,
        sport: profile.sport,
        location: profile.location,
        locationLabel,
        age: toAge(profile.dateOfBirth),
        category: profile.category,
        experienceLevel: profile.experienceLevel,
        bio: profile.bio,
        academyName: profile.academyName,
        coachName: profile.coachName,
        verificationStatus: profile.verificationStatus,
        achievements: profile.achievements,
        events: profile.events,
        requirements: profile.requirements,
      },
    });
  } catch (err) {
    next(err);
  }
});
