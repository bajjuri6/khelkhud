import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter: Router = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.uid, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: req.user!.uid, readAt: null } }),
    ]);
    res.json({ data: { notifications, unreadCount } });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: req.user!.uid },
      data: { readAt: new Date() },
    });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.uid, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});
