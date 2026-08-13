import { LocationLevel, LocationSource, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Village resolution: PIN narrows, fuzzy name ranks, a human confirms.
 *
 * Never auto-assigns. The caller shows ranked candidates and the user picks — see
 * docs/architecture/v2-village-model.md section 3 for why. Getting this wrong scatters a
 * village's diaspora across four spellings of its name, and the whole product is built on
 * donors finding the one place they care about.
 *
 * The pilot data alone has four distinct villages called "Venkatapur" at four PINs across
 * two districts, so name-only matching was never viable.
 */

export type VillageMatch = {
  id: string;
  name: string;
  displayPath: string | null;
  pincode: string | null;
  level: LocationLevel;
  source: LocationSource;
  isVerified: boolean;
  /** 0-1 trigram similarity against the typed name. 1 = exact. */
  score: number;
};

const PIN_RE = /^\d{6}$/;

/** Below this, a "match" is noise that would only mislead someone into picking it. */
const MIN_SCORE = 0.2;

export function isValidPincode(pin: string): boolean {
  return PIN_RE.test(pin.trim());
}

/**
 * Rank villages against a typed name, optionally narrowed by PIN.
 *
 * Ordering, in priority:
 *   1. PIN match, when supplied — a correct PIN is far stronger evidence than a name that
 *      looks right, because names are transliterated and PINs are not.
 *   2. Trigram similarity against the name and each alias, best of.
 *   3. Verified (LGD-reconciled) rows above unverified ones, so a MANUAL row added to work
 *      around a dataset gap never outranks the canonical village it duplicates.
 *
 * Raw SQL rather than Prisma: similarity() and the GIN trigram index have no query-builder
 * equivalent, and doing it in application code would mean pulling every village in the
 * country into memory.
 */
export async function searchVillages(opts: {
  name?: string;
  pincode?: string;
  limit?: number;
}): Promise<VillageMatch[]> {
  const name = (opts.name ?? "").trim();
  const pincode = (opts.pincode ?? "").trim();
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

  if (!name && !isValidPincode(pincode)) return [];

  // A PIN with no name: list everything it covers. A post office area is typically 1-15
  // villages, which is a short enough list to just show.
  if (!name && isValidPincode(pincode)) {
    const rows = await prisma.location.findMany({
      where: { pincode, level: { in: [LocationLevel.VILLAGE, LocationLevel.CITY] } },
      orderBy: [{ isVerified: "desc" }, { name: "asc" }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayPath: r.displayPath,
      pincode: r.pincode,
      level: r.level,
      source: r.source,
      isVerified: r.isVerified,
      score: 1,
    }));
  }

  const pinFilter = isValidPincode(pincode) ? pincode : null;

  // GREATEST over the name and the best-matching alias, so "Ammapoor" still finds
  // "Ammapur" when the alternate spelling is the one recorded.
  // The candidate filter uses the `%` operator, NOT `similarity() > x`. Only `%` can use
  // the GIN trigram index; a bare similarity() comparison forces a sequential scan. That
  // is 2ms across the pilot districts and a full table scan once this is national.
  //
  // `%` compares against pg_trgm.similarity_threshold, set LOCAL so it is scoped to this
  // transaction — set_limit() would leak the setting across a pooled connection.
  //
  // unaccent stays in the SCORE but not the filter: unaccent is not IMMUTABLE and so
  // cannot be indexed, and the candidate set is already small by the time scoring runs.
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = ${MIN_SCORE}`);
    return tx.$queryRaw<(Omit<VillageMatch, "score"> & { score: number })[]>(Prisma.sql`
    SELECT
      l.id,
      l.name,
      l."displayPath",
      l.pincode,
      l.level,
      l.source,
      l."isVerified",
      GREATEST(
        similarity(unaccent(lower(l.name)), unaccent(lower(${name}))),
        COALESCE((
          SELECT MAX(similarity(unaccent(lower(a)), unaccent(lower(${name}))))
          FROM unnest(l.aliases) AS a
        ), 0)
      ) AS score
    FROM "Location" l
    WHERE l.level IN ('VILLAGE', 'CITY')
      AND (${pinFilter}::text IS NULL OR l.pincode = ${pinFilter})
      AND (
        lower(l.name) % lower(${name})
        OR EXISTS (
          SELECT 1 FROM unnest(l.aliases) AS a WHERE lower(a) % lower(${name})
        )
      )
    ORDER BY
      (${pinFilter}::text IS NOT NULL AND l.pincode = ${pinFilter}) DESC,
      score DESC,
      l."isVerified" DESC,
      l.name ASC
      LIMIT ${limit}
    `);
  });

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

/**
 * Record a village the datasets missed.
 *
 * A gap must never block a real athlete, but an unverified row must never masquerade as
 * canonical either — so it is created source=MANUAL, isVerified=false, and the resolver
 * ranks it below reconciled rows. Attaching it under the right mandal keeps the tree
 * intact so it can be reconciled against LGD later rather than floating free.
 */
export async function createManualVillage(input: {
  name: string;
  pincode: string;
  mandalId: string;
  createdByUserId: string;
}): Promise<VillageMatch> {
  const name = input.name.trim();
  if (!name) throw new Error("Village name is required");
  if (!isValidPincode(input.pincode)) throw new Error("A 6-digit PIN code is required");

  const mandal = await prisma.location.findUniqueOrThrow({
    where: { id: input.mandalId },
    include: { parent: { include: { parent: true } } },
  });

  // Idempotent: two coordinators adding the same missing village should not create two.
  const existing = await prisma.location.findFirst({
    where: {
      name,
      level: LocationLevel.VILLAGE,
      parentId: mandal.id,
    },
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      displayPath: existing.displayPath,
      pincode: existing.pincode,
      level: existing.level,
      source: existing.source,
      isVerified: existing.isVerified,
      score: 1,
    };
  }

  const district = mandal.parent;
  const state = district?.parent;
  const displayPath = [name, mandal.name, district?.name, state?.name]
    .filter(Boolean)
    .join(", ");

  const created = await prisma.location.create({
    data: {
      name,
      level: LocationLevel.VILLAGE,
      parentId: mandal.id,
      pincode: input.pincode,
      displayPath,
      source: LocationSource.MANUAL,
      isVerified: false,
    },
  });

  return {
    id: created.id,
    name: created.name,
    displayPath: created.displayPath,
    pincode: created.pincode,
    level: created.level,
    source: created.source,
    isVerified: created.isVerified,
    score: 1,
  };
}
