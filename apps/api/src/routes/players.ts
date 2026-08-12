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

// ---------- Public discovery ----------

function qstr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

playersRouter.get("/", async (req, res, next) => {
  try {
    const q = qstr(req.query.q);
    const sportId = qstr(req.query.sportId);
    const category = qstr(req.query.category);
    const locationId = qstr(req.query.locationId);
    const minPaise = req.query.minPaise ? Number(req.query.minPaise) : undefined;
    const maxPaise = req.query.maxPaise ? Number(req.query.maxPaise) : undefined;
    const verifiedOnly = req.query.verifiedOnly !== "false";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(24, Number(req.query.pageSize) || 12);

    // Location filter matches the whole subtree (state -> districts -> cities).
    let locationIds: string[] | undefined;
    const allLocations = await prisma.location.findMany({
      select: { id: true, name: true, parentId: true },
    });
    if (locationId) {
      const childrenOf = new Map<string | null, string[]>();
      for (const l of allLocations) {
        const list = childrenOf.get(l.parentId) ?? [];
        list.push(l.id);
        childrenOf.set(l.parentId, list);
      }
      locationIds = [];
      const queue = [locationId];
      while (queue.length > 0) {
        const id = queue.pop()!;
        locationIds.push(id);
        queue.push(...(childrenOf.get(id) ?? []));
      }
    }

    const openStatuses = ["OPEN", "PARTIALLY_FUNDED"] as const;
    const where = {
      user: {
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      ...(verifiedOnly ? { verificationStatus: "VERIFIED" as const } : {}),
      ...(sportId ? { sportId } : {}),
      ...(category ? { category: category as never } : {}),
      ...(locationIds ? { locationId: { in: locationIds } } : {}),
      ...(minPaise !== undefined || maxPaise !== undefined
        ? {
            requirements: {
              some: {
                status: { in: [...openStatuses] },
                totalAmountPaise: {
                  ...(minPaise !== undefined ? { gte: minPaise } : {}),
                  ...(maxPaise !== undefined ? { lte: maxPaise } : {}),
                },
              },
            },
          }
        : {}),
    };

    const [total, players] = await prisma.$transaction([
      prisma.playerProfile.count({ where }),
      prisma.playerProfile.findMany({
        where,
        include: {
          user: { select: { name: true, avatarUrl: true } },
          sport: { select: { id: true, name: true } },
          achievements: { orderBy: [{ year: "desc" }, { createdAt: "desc" }], take: 1 },
          requirements: {
            where: { status: { in: [...openStatuses] } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [{ verificationStatus: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const locationById = new Map(allLocations.map((l) => [l.id, l]));
    const label = (id: string | null): string | null => {
      const parts: string[] = [];
      let cur = id ? locationById.get(id) : undefined;
      while (cur) {
        parts.push(cur.name);
        cur = cur.parentId ? locationById.get(cur.parentId) : undefined;
      }
      return parts.length > 0 ? parts.join(", ") : null;
    };

    res.json({
      data: players.map((p) => ({
        id: p.id,
        name: p.user.name,
        avatarUrl: p.user.avatarUrl,
        photoKey: p.photoKey,
        sport: p.sport,
        category: p.category,
        experienceLevel: p.experienceLevel,
        locationLabel: label(p.locationId),
        verificationStatus: p.verificationStatus,
        topAchievement: p.achievements[0]?.title ?? null,
        openRequirement: p.requirements[0]
          ? {
              id: p.requirements[0].id,
              title: p.requirements[0].title,
              totalAmountPaise: p.requirements[0].totalAmountPaise,
              raisedAmountPaise: p.requirements[0].raisedAmountPaise,
            }
          : null,
      })),
      meta: { total, page, pageSize },
    });
  } catch (err) {
    next(err);
  }
});

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
