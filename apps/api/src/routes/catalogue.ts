import { Router } from "express";
import { catalogueQuerySchema, isOverpriced } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errors.js";
import { PUBLIC_OFFER_WHERE } from "../services/supplier.service.js";

export const catalogueRouter: Router = Router();

/**
 * The public catalogue.
 *
 * Not a shop — khelkhud never holds the money or the goods. This is the vocabulary the two
 * ends of the transaction share: a coordinator in Ammapur and a donor in New Jersey have to
 * be able to mean the same object, and `indicativePaise` is what tells the donor that
 * ₹18,000 for that bat is wrong. Both routes are unauthenticated on purpose; /equipment is
 * also an SEO surface.
 *
 * Nothing here consults the caller's identity, so visibility is decided entirely by
 * PUBLIC_OFFER_WHERE. Keeping that in the service rather than restating the predicate here
 * is what stops an unapproved supplier leaking into a donor's view through a route that
 * forgot a clause.
 */


/** Browse and search. Powers both /equipment and the request-form picker. */
catalogueRouter.get("/", async (req, res, next) => {
  try {
    const parsed = catalogueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ApiError(
        400,
        "VALIDATION",
        first ? `${first.path.join(".") || "query"}: ${first.message}` : "Invalid query",
      );
    }
    const { q, category, sportId, page, pageSize } = parsed.data;

    const where = {
      isActive: true,
      ...(category ? { category } : {}),
      ...(sportId ? { sportId } : {}),
      // `spec` carries the size/weight/material that make an item buyable, so "size 6"
      // has to match there as well as in the name — searching the name alone would miss
      // exactly the detail the searcher is being precise about.
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { spec: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await prisma.$transaction([
      prisma.equipmentItem.count({ where }),
      prisma.equipmentItem.findMany({
        where,
        include: {
          sport: { select: { id: true, name: true } },
          // Counted with the public filter, not raw: a card promising "3 places to buy
          // this" that opens onto one link is a lie the list tells on the detail page's
          // behalf.
          _count: { select: { offers: { where: PUBLIC_OFFER_WHERE } } },
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      data: items.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        category: item.category,
        spec: item.spec,
        indicativePaise: item.indicativePaise,
        sport: item.sport,
        offerCount: item._count.offers,
      })),
      meta: { page, pageSize, total },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * One item and where to buy it.
 *
 * Accepts either the cuid or the slug: the slug is the public URL key (/equipment/<slug>)
 * and survives a re-import, while internal callers already hold an id.
 */
catalogueRouter.get("/:idOrSlug", async (req, res, next) => {
  try {
    const key = String(req.params.idOrSlug);

    const item = await prisma.equipmentItem.findFirst({
      // An inactive item is a 404 rather than a hidden 200: it has been withdrawn from the
      // vocabulary, and a donor following an old link should be told so, not shown a page
      // with no offers on it.
      where: { isActive: true, OR: [{ id: key }, { slug: key }] },
      include: {
        sport: { select: { id: true, name: true } },
        offers: {
          where: PUBLIC_OFFER_WHERE,
          include: { supplier: { select: { id: true, name: true, website: true } } },
        },
      },
    });
    if (!item) throw new ApiError(404, "NOT_FOUND", "No such catalogue item");

    const offers = item.offers
      .map((offer) => ({
        id: offer.id,
        marketplace: offer.marketplace,
        url: offer.url,
        pricePaise: offer.pricePaise,
        // Links and prices rot and we do not scrape to refresh — brittle and adversarial.
        // The honest move is to hand the UI the age and let the donor judge.
        checkedAt: offer.checkedAt,
        isOverpriced: isOverpriced(offer.pricePaise, item.indicativePaise),
        supplier: offer.supplier,
      }))
      // Sorted, never filtered. An offer above the indicative price stays visible and
      // ranks last, because hiding it would be a silent judgement made on a number an
      // admin may simply have set wrong (spec §9.2). Staleness deliberately does NOT
      // reorder — it is shown, so the genuinely cheapest link never gets buried under a
      // pricier one whose only merit is a fresher timestamp.
      .sort(
        (a, b) =>
          Number(a.isOverpriced) - Number(b.isOverpriced) ||
          a.pricePaise - b.pricePaise ||
          b.checkedAt.getTime() - a.checkedAt.getTime(),
      );

    res.json({
      data: {
        id: item.id,
        slug: item.slug,
        name: item.name,
        category: item.category,
        spec: item.spec,
        indicativePaise: item.indicativePaise,
        sport: item.sport,
        offers,
      },
    });
  } catch (err) {
    next(err);
  }
});
