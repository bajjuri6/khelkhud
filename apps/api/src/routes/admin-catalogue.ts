import express, { Router } from "express";
import {
  catalogueQuerySchema,
  equipmentItemCreateSchema,
  equipmentItemUpdateSchema,
  equipmentSlug,
} from "@khelkhud/shared";
import type { EquipmentItemCreateInput, EquipmentItemUpdateInput } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";
import {
  catalogueTemplateBuffer,
  importCatalogue,
  parseCatalogueFile,
  validateRows,
} from "../services/catalogue-import.js";

/**
 * Admin curation of the catalogue.
 *
 * Separate from the public router rather than a flag on it. The public route exists to
 * show donors what they can buy and filters to active items; an admin needs to see what
 * they have retired in order to bring it back. Bolting `?includeInactive` onto a public
 * endpoint means one forgotten auth check leaks the retired catalogue, so the two
 * audiences get two routes.
 *
 * Mounted BEFORE /api/admin in index.ts — Express matches mounts in order, and the
 * general admin router would otherwise swallow these paths.
 */
export const adminCatalogueRouter: Router = Router();

adminCatalogueRouter.use(requireAuth, requireRole("ADMIN"));

/** Everything, including retired items. The admin list Lane C's UI reads. */
adminCatalogueRouter.get("/", async (req, res, next) => {
  try {
    const parsed = catalogueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const { q, category, sportId, page, pageSize } = parsed.data;

    const where = {
      ...(category ? { category } : {}),
      ...(sportId ? { sportId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { spec: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.equipmentItem.findMany({
        where,
        include: {
          sport: { select: { id: true, name: true } },
          // Unfiltered on purpose: an admin needs to know an item has offers even when
          // they are all hidden behind an unapproved supplier, or they will "fix" an
          // item that is not actually missing links.
          _count: { select: { offers: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.equipmentItem.count({ where }),
    ]);

    res.json({ data, meta: { page, pageSize, total } });
  } catch (err) {
    next(err);
  }
});

adminCatalogueRouter.post("/", validate(equipmentItemCreateSchema), async (req, res, next) => {
  try {
    const body = req.body as EquipmentItemCreateInput;

    const sport = body.sportId
      ? await prisma.sport.findUnique({ where: { id: body.sportId }, select: { name: true } })
      : null;
    if (body.sportId && !sport) {
      throw new ApiError(400, "INVALID_SPORT", "That sport does not exist");
    }

    // Same slug function the seed and the importer use, so a hand-added item and an
    // imported one cannot end up as two rows for the same object.
    const slug = equipmentSlug({
      name: body.name,
      category: body.category,
      sport: sport?.name ?? null,
    });

    const clash = await prisma.equipmentItem.findUnique({ where: { slug } });
    if (clash) {
      throw new ApiError(
        409,
        "ALREADY_EXISTS",
        `"${clash.name}" is already in the catalogue${clash.isActive ? "" : " (retired — reactivate it instead)"}`,
      );
    }

    const created = await prisma.equipmentItem.create({
      data: {
        slug,
        name: body.name,
        category: body.category,
        spec: body.spec ?? null,
        sportId: body.sportId ?? null,
        indicativePaise: body.indicativePaise,
      },
      include: { sport: { select: { id: true, name: true } }, _count: { select: { offers: true } } },
    });
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

adminCatalogueRouter.patch("/:id", validate(equipmentItemUpdateSchema), async (req, res, next) => {
  try {
    const body = req.body as EquipmentItemUpdateInput;
    const existing = await prisma.equipmentItem.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Item not found");

    if (body.sportId) {
      const sport = await prisma.sport.findUnique({ where: { id: body.sportId } });
      if (!sport) throw new ApiError(400, "INVALID_SPORT", "That sport does not exist");
    }

    // The slug is deliberately NOT recomputed on rename. It is the importer's dedupe key
    // and a public URL; changing it would make the next re-import create a duplicate of
    // the item that was just renamed, and break any link already shared.
    const updated = await prisma.equipmentItem.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.spec !== undefined ? { spec: body.spec ?? null } : {}),
        ...(body.sportId !== undefined ? { sportId: body.sportId ?? null } : {}),
        ...(body.indicativePaise !== undefined ? { indicativePaise: body.indicativePaise } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: { sport: { select: { id: true, name: true } }, _count: { select: { offers: true } } },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------- Bulk import ----------
//
// Raw body rather than multipart. A spreadsheet upload carries one file and no other
// fields, so multer would be a dependency bought for nothing; the flags travel as query
// params. Limit is generous for a catalogue sheet and stingy for anything else.
const SHEET_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/octet-stream",
];

/** The template, generated from the same field list the validator uses so they cannot drift. */
adminCatalogueRouter.get("/import/template", async (_req, res, next) => {
  try {
    const buf = await catalogueTemplateBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="khelkhud-catalogue-template.xlsx"');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

/**
 * Upload a sheet. Dry run unless `?commit=true`.
 *
 * The default matters more than it looks: an operator who can only ever reach a write by
 * asking for it twice cannot destroy the catalogue with one mis-click, and the plan they
 * confirm is computed by the same code that will apply it.
 */
adminCatalogueRouter.post(
  "/import",
  express.raw({ type: SHEET_TYPES, limit: "5mb" }),
  async (req, res, next) => {
    try {
      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new ApiError(400, "NO_FILE", "Attach a .xlsx or .csv file");
      }
      const filename = typeof req.query.filename === "string" ? req.query.filename : "upload.xlsx";
      const commit = req.query.commit === "true";
      const allowPartial = req.query.allowPartial === "true";

      const raw = await parseCatalogueFile(buffer, filename);
      const { valid, errors } = validateRows(raw);
      const result = await importCatalogue(valid, {
        dryRun: !commit,
        allowPartial,
        priorErrors: errors,
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);
