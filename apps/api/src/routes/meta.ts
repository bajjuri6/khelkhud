import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const metaRouter: Router = Router();

metaRouter.get("/sports", async (_req, res, next) => {
  try {
    const sports = await prisma.sport.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    res.json({ data: sports });
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/locations", async (req, res, next) => {
  try {
    const { level, parentId } = req.query;
    const locations = await prisma.location.findMany({
      where: {
        ...(typeof level === "string" && ["STATE", "DISTRICT", "CITY"].includes(level)
          ? { level: level as "STATE" | "DISTRICT" | "CITY" }
          : {}),
        ...(typeof parentId === "string" ? { parentId: parentId || null } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, level: true, parentId: true },
    });
    res.json({ data: locations });
  } catch (err) {
    next(err);
  }
});
