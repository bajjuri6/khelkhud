import { Router } from "express";
import {
  achievementSchema,
  eventSchema,
  athleteProfileUpdateSchema,
  requestCreateSchema,
  requestUpdateSchema,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";

export const athletesRouter: Router = Router();

async function myProfile(uid: string) {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId: uid } });
  if (!profile) throw new ApiError(404, "NO_PROFILE", "Athlete profile not found");
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

athletesRouter.get("/", async (req, res, next) => {
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

    const openStatuses = ["OPEN", "PARTIALLY_FULFILLED"] as const;
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
            requests: {
              some: {
                status: { in: [...openStatuses] },
                totalEstimatedPaise: {
                  ...(minPaise !== undefined ? { gte: minPaise } : {}),
                  ...(maxPaise !== undefined ? { lte: maxPaise } : {}),
                },
              },
            },
          }
        : {}),
    };

    const [total, athletes] = await prisma.$transaction([
      prisma.athleteProfile.count({ where }),
      prisma.athleteProfile.findMany({
        where,
        include: {
          user: { select: { name: true, avatarUrl: true } },
          sport: { select: { id: true, name: true } },
          achievements: { orderBy: [{ year: "desc" }, { createdAt: "desc" }], take: 1 },
          requests: {
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
      data: athletes.map((p) => ({
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
        openRequest: p.requests[0]
          ? {
              id: p.requests[0].id,
              title: p.requests[0].title,
              totalEstimatedPaise: p.requests[0].totalEstimatedPaise,
              raisedAmountPaise: p.requests[0].raisedAmountPaise,
            }
          : null,
      })),
      meta: { total, page, pageSize },
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Own profile (ATHLETE) ----------

athletesRouter.get("/me", requireAuth, requireRole("ATHLETE"), async (req, res, next) => {
  try {
    const profile = await prisma.athleteProfile.findUnique({
      where: { userId: req.user!.uid },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
        sport: true,
        location: true,
        achievements: { orderBy: [{ year: "desc" }, { createdAt: "desc" }] },
        events: { orderBy: { date: "asc" } },
        requests: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!profile) throw new ApiError(404, "NO_PROFILE", "Athlete profile not found");
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

athletesRouter.put(
  "/me",
  requireAuth,
  requireRole("ATHLETE"),
  validate(athleteProfileUpdateSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const { dateOfBirth, ...rest } = req.body;
      const updated = await prisma.athleteProfile.update({
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

athletesRouter.post(
  "/me/achievements",
  requireAuth,
  requireRole("ATHLETE"),
  validate(achievementSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const achievement = await prisma.achievement.create({
        data: { ...req.body, athleteId: profile.id },
      });
      res.status(201).json({ data: achievement });
    } catch (err) {
      next(err);
    }
  },
);

athletesRouter.put(
  "/me/achievements/:id",
  requireAuth,
  requireRole("ATHLETE"),
  validate(achievementSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.achievement.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.athleteId !== profile.id) {
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

athletesRouter.delete(
  "/me/achievements/:id",
  requireAuth,
  requireRole("ATHLETE"),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.achievement.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.athleteId !== profile.id) {
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

athletesRouter.post(
  "/me/events",
  requireAuth,
  requireRole("ATHLETE"),
  validate(eventSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const { date, ...rest } = req.body;
      const event = await prisma.event.create({
        data: { ...rest, date: date ? new Date(date) : null, athleteId: profile.id },
      });
      res.status(201).json({ data: event });
    } catch (err) {
      next(err);
    }
  },
);

athletesRouter.put(
  "/me/events/:id",
  requireAuth,
  requireRole("ATHLETE"),
  validate(eventSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.athleteId !== profile.id) {
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

athletesRouter.delete(
  "/me/events/:id",
  requireAuth,
  requireRole("ATHLETE"),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.athleteId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Event not found");
      }
      await prisma.event.delete({ where: { id: existing.id } });
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

athletesRouter.get(
  "/me/dashboard",
  requireAuth,
  requireRole("ATHLETE"),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const [paid, requests, upcomingEvents] = await Promise.all([
        prisma.sponsorship.findMany({
          where: { athleteId: profile.id, paymentStatus: "PAID" },
          select: { amountPaise: true, status: true },
        }),
        prisma.request.findMany({
          where: { athleteId: profile.id, status: { not: "CLOSED" } },
          select: { totalEstimatedPaise: true, raisedAmountPaise: true },
        }),
        prisma.event.count({
          where: { athleteId: profile.id, isUpcoming: true },
        }),
      ]);
      res.json({
        data: {
          totalReceivedPaise: paid.reduce((s, x) => s + x.amountPaise, 0),
          activeSponsorships: paid.filter((s) => s.status === "ACTIVE").length,
          fundingRequiredPaise: requests.reduce((s, r) => s + r.totalEstimatedPaise, 0),
          fundingReceivedPaise: requests.reduce((s, r) => s + r.raisedAmountPaise, 0),
          upcomingEvents,
          verificationStatus: profile.verificationStatus,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Sponsorships (athlete view) ----------

athletesRouter.get(
  "/me/sponsorships",
  requireAuth,
  requireRole("ATHLETE"),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const sponsorships = await prisma.sponsorship.findMany({
        where: { athleteId: profile.id, paymentStatus: "PAID" },
        include: {
          sponsor: { include: { user: { select: { name: true, avatarUrl: true } } } },
          request: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      // Respect anonymity toward the athlete.
      res.json({
        data: sponsorships.map((s) => ({
          ...s,
          sponsor: s.isAnonymous
            ? { displayName: "Anonymous sponsor", user: { name: "Anonymous", avatarUrl: null } }
            : s.sponsor,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Requests ----------

athletesRouter.post(
  "/me/requests",
  requireAuth,
  requireRole("ATHLETE"),
  validate(requestCreateSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const { deadline, ...rest } = req.body;
      const request = await prisma.request.create({
        data: { ...rest, deadline: deadline ? new Date(deadline) : null, athleteId: profile.id },
      });
      res.status(201).json({ data: request });
    } catch (err) {
      next(err);
    }
  },
);

athletesRouter.put(
  "/me/requests/:id",
  requireAuth,
  requireRole("ATHLETE"),
  validate(requestUpdateSchema),
  async (req, res, next) => {
    try {
      const profile = await myProfile(req.user!.uid);
      const existing = await prisma.request.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!existing || existing.athleteId !== profile.id) {
        throw new ApiError(404, "NOT_FOUND", "Request not found");
      }
      const { deadline, ...rest } = req.body;
      const request = await prisma.request.update({
        where: { id: existing.id },
        data: {
          ...rest,
          ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
        },
      });
      res.json({ data: request });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Public updates ----------

athletesRouter.get("/:id/updates", async (req, res, next) => {
  try {
    // Only general (non-sponsorship-linked) updates are public.
    const updates = await prisma.sponsorshipUpdate.findMany({
      where: { athleteId: String(req.params.id), sponsorshipId: null },
      include: {
        attachments: { select: { id: true, fileName: true, mimeType: true, kind: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ data: updates });
  } catch (err) {
    next(err);
  }
});

// ---------- Public profile ----------

athletesRouter.get("/:id", async (req, res, next) => {
  try {
    const profile = await prisma.athleteProfile.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: { select: { name: true, avatarUrl: true, isActive: true } },
        sport: { select: { id: true, name: true, slug: true } },
        location: { select: { id: true, name: true, level: true, parentId: true } },
        achievements: { orderBy: [{ year: "desc" }, { createdAt: "desc" }] },
        events: { orderBy: { date: "asc" } },
        requests: {
          where: { status: { in: ["OPEN", "PARTIALLY_FULFILLED", "FULFILLED"] } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!profile || !profile.user.isActive) {
      throw new ApiError(404, "NOT_FOUND", "Athlete not found");
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
        requests: profile.requests,
      },
    });
  } catch (err) {
    next(err);
  }
});
