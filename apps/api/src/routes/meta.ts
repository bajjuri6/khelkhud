import { Router } from "express";
import { ApiError } from "../middleware/errors.js";
import { isValidPincode, searchVillages } from "../services/village.service.js";
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

// ---------------------------------------------------------------------------
// Village resolution. Public: an athlete or coordinator needs this before they have an
// account, and it exposes nothing that is not already public geography.
// ---------------------------------------------------------------------------
metaRouter.get("/villages/search", async (req, res, next) => {
  try {
    const name = typeof req.query.q === "string" ? req.query.q : "";
    const pincode = typeof req.query.pincode === "string" ? req.query.pincode : "";
    const limit = Number(req.query.limit) || 10;

    if (!name.trim() && !isValidPincode(pincode)) {
      throw new ApiError(
        400,
        "VALIDATION",
        "Provide a village name, a 6-digit PIN code, or both.",
      );
    }

    const data = await searchVillages({ name, pincode, limit });
    res.json({
      data,
      meta: {
        // Surfaced so the UI can say "no match — add it" rather than showing an empty box,
        // and so it can warn when a PIN was ignored because it was malformed.
        pincodeApplied: isValidPincode(pincode),
        count: data.length,
      },
    });
  } catch (err) {
    next(err);
  }
});
