import { z } from "zod";

export const EQUIPMENT_CATEGORIES = [
  "BAT",
  "BALL",
  "SHOE",
  "KIT",
  "PROTECTIVE",
  "MAT",
  "NET",
  "APPAREL",
  "TRAINING",
  "OTHER",
] as const;

export const MARKETPLACES = ["AMAZON", "FLIPKART", "MEESHO", "DIRECT"] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export type Marketplace = (typeof MARKETPLACES)[number];

/**
 * An offer this far above the catalogue's indicative price is flagged in the UI and sorted
 * last — never hidden. Hiding would be a silent judgement made on a number an admin may
 * simply have set wrong. One constant so it is one edit to tune.
 */
export const OVERPRICED_MULTIPLE = 1.25;

export function isOverpriced(pricePaise: number, indicativePaise: number): boolean {
  if (indicativePaise <= 0) return false;
  return pricePaise > indicativePaise * OVERPRICED_MULTIPLE;
}

/**
 * The import dedupe key.
 *
 * `name` cannot be one: "Cricket bat size 6" and "Cricket Bat, Size 6" are the same
 * object, and an admin will re-upload a corrected sheet. Deriving the slug from the same
 * fields every time is what makes a re-import an update rather than a duplicate.
 */
export function equipmentSlug(input: {
  name: string;
  category: string;
  sport?: string | null;
}): string {
  const tokens = [input.sport, input.category, input.name]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .normalize("NFKD")
    // Escaped rather than literal combining marks: they are invisible in source and get
    // mangled by anything that touches the file.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean);

  // Drop repeats: the name usually already says the sport and the category, so the naive
  // join gives "cricket-kit-cricket-kit-bag-wheelie". These become public /equipment/<slug>
  // URLs, so the duplication is worth removing. Order is preserved, first occurrence wins.
  const seen = new Set<string>();
  const deduped = tokens.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));

  return deduped.join("-").slice(0, 120).replace(/-+$/, "");
}

const paise = z.number().int().positive().max(100_000_000);

export const equipmentItemCreateSchema = z.object({
  name: z.string().trim().min(3).max(160),
  sportId: z.string().nullish(),
  category: z.enum(EQUIPMENT_CATEGORIES),
  spec: z.string().trim().max(500).nullish(),
  indicativePaise: paise,
});

export const equipmentItemUpdateSchema = equipmentItemCreateSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

/**
 * An offer as a supplier submits it. `supplierId` is deliberately absent — it comes from
 * the session, never the body, so a supplier cannot post an offer as someone else.
 */
export const supplierOfferCreateSchema = z.object({
  equipmentItemId: z.string().min(1),
  marketplace: z.enum(MARKETPLACES),
  url: z.string().url().max(2000),
  pricePaise: paise,
});

export const supplierOfferUpdateSchema = z.object({
  marketplace: z.enum(MARKETPLACES).optional(),
  url: z.string().url().max(2000).optional(),
  pricePaise: paise.optional(),
  isActive: z.boolean().optional(),
  /** Re-affirming a link that is still good, without changing the price. */
  checked: z.boolean().optional(),
});

export const catalogueQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(EQUIPMENT_CATEGORIES).optional(),
  sportId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
});

/**
 * One row of an import sheet.
 *
 * Coerced rather than strict because a spreadsheet cell is a string even when it holds a
 * number, and rejecting "1800" for not being 1800 helps nobody. Prices arrive in RUPEES —
 * the sheet is filled in by a human, and asking them to type paise invites a 100x error on
 * the number that exists to prevent overpaying.
 */
export const catalogueImportRowSchema = z.object({
  name: z.string().trim().min(3).max(160),
  category: z.enum(EQUIPMENT_CATEGORIES),
  sport: z.string().trim().max(60).optional().nullable(),
  spec: z.string().trim().max(500).optional().nullable(),
  indicativeRupees: z.coerce.number().positive().max(1_000_000),
  marketplace: z.enum(MARKETPLACES).optional().nullable(),
  url: z.string().url().max(2000).optional().nullable(),
  priceRupees: z.coerce.number().positive().max(1_000_000).optional().nullable(),
});

export type EquipmentItemCreateInput = z.infer<typeof equipmentItemCreateSchema>;
export type EquipmentItemUpdateInput = z.infer<typeof equipmentItemUpdateSchema>;
export type SupplierOfferCreateInput = z.infer<typeof supplierOfferCreateSchema>;
export type SupplierOfferUpdateInput = z.infer<typeof supplierOfferUpdateSchema>;
export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;
export type CatalogueImportRow = z.infer<typeof catalogueImportRowSchema>;
