import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import {
  EQUIPMENT_CATEGORIES,
  MARKETPLACES,
  catalogueImportRowSchema,
  equipmentSlug,
  type CatalogueImportRow,
  type EquipmentCategory,
  type Marketplace,
} from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errors.js";

/**
 * Bulk catalogue import.
 *
 * Three entry points want this — the CLI, the admin upload route, and the template the
 * admin fills in — and they must share ONE validator. Three parsers that drift is how a
 * bulk import silently writes different data than the form does.
 *
 * Two properties this file exists to guarantee:
 *
 * 1. **Re-importing a corrected sheet updates, it does not duplicate.** An admin *will*
 *    re-upload. Everything dedupes on `equipmentSlug()` — the same key `prisma/seed.ts`
 *    upserts on, so seeding and importing cannot produce two rows for the same object.
 * 2. **Nothing is written until asked.** `dryRun` defaults true and `allowPartial` defaults
 *    false. An import that silently half-applies is worse than one that refuses.
 */

/** The field list, taken from the validator so the template and the parser cannot drift. */
export const IMPORT_COLUMNS = Object.keys(
  catalogueImportRowSchema.shape,
) as (keyof CatalogueImportRow)[];

/** One sheet row, before validation. `rowNumber` is what the operator sees in Excel. */
export type RawRow = {
  rowNumber: number;
  values: Record<string, unknown>;
};

export type RowError = {
  row: number;
  column: string;
  value: unknown;
  message: string;
};

export type ValidRow = CatalogueImportRow & { row: number };

// ---------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------

/**
 * Headers are matched on letters and digits only, so "Indicative Rupees", "indicative
 * rupees" and "indicativeRupees" are the same column. An operator retyping a header by
 * hand should not cost them the upload.
 */
function normaliseHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** What people actually type instead of the field name. Deliberately short. */
const HEADER_ALIASES: Record<string, keyof CatalogueImportRow> = {
  itemname: "name",
  indicativeprice: "indicativeRupees",
  indicativepricerupees: "indicativeRupees",
  price: "indicativeRupees",
  specification: "spec",
  details: "spec",
  sportname: "sport",
  offerprice: "priceRupees",
  offerpricerupees: "priceRupees",
  offerurl: "url",
  offerlink: "url",
  link: "url",
};

const HEADER_LOOKUP: Record<string, keyof CatalogueImportRow> = {
  ...HEADER_ALIASES,
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [normaliseHeader(c), c])),
};

/**
 * A cell is not always a string. exceljs hands back numbers, formula results, rich text and
 * hyperlink objects depending on what the operator did to the cell, and `String(cell)` on
 * any of the object forms yields "[object Object]" — which then fails validation with a
 * message that tells them nothing.
 */
function cellValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // A pasted URL becomes {text, hyperlink}. The target is what we want to store; the
    // display text may be a label the operator typed over it.
    if (typeof v.hyperlink === "string") return cellValue(v.hyperlink);
    if (Array.isArray(v.richText)) {
      return cellValue(v.richText.map((r) => (r as { text?: string }).text ?? "").join(""));
    }
    if ("result" in v) return cellValue(v.result);
    if (typeof v.text === "string") return cellValue(v.text);
  }
  return cellValue(String(value));
}

function rowCells(row: ExcelJS.Row): unknown[] {
  // `row.values` is 1-based with a hole at index 0 — indexing it by column number directly
  // is the only reading that lines up with what Excel shows.
  const values = row.values;
  return Array.isArray(values) ? (values as unknown[]) : [];
}

function worksheetToRows(sheet: ExcelJS.Worksheet, source: string): RawRow[] {
  const present: { rowNumber: number; cells: unknown[] }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    present.push({ rowNumber, cells: rowCells(row) });
  });

  const headerRow = present.shift();
  if (!headerRow) {
    throw new ApiError(400, "EMPTY_SHEET", `${source} has no rows`);
  }

  const columnByIndex = new Map<number, keyof CatalogueImportRow>();
  for (let i = 1; i < headerRow.cells.length; i++) {
    const text = cellValue(headerRow.cells[i]);
    if (typeof text !== "string") continue;
    const field = HEADER_LOOKUP[normaliseHeader(text)];
    if (field) columnByIndex.set(i, field);
  }

  // A missing required column is a file-level mistake — usually the wrong sheet or a
  // renamed header — and reporting it once beats emitting the same error on 200 rows.
  const required: (keyof CatalogueImportRow)[] = ["name", "category", "indicativeRupees"];
  const found = new Set(columnByIndex.values());
  const missing = required.filter((c) => !found.has(c));
  if (missing.length > 0) {
    throw new ApiError(
      400,
      "MISSING_COLUMNS",
      `${source} is missing required column(s): ${missing.join(", ")}. ` +
        `Expected headers: ${IMPORT_COLUMNS.join(", ")}`,
    );
  }

  const rows: RawRow[] = [];
  for (const { rowNumber, cells } of present) {
    const values: Record<string, unknown> = {};
    for (const [index, field] of columnByIndex) {
      const v = cellValue(cells[index]);
      if (v !== undefined) values[field] = v;
    }
    // Trailing formatting leaves rows that look present and hold nothing. Reporting them as
    // "name is required" would bury the real errors under noise.
    if (Object.keys(values).length === 0) continue;
    rows.push({ rowNumber, values });
  }
  return rows;
}

/** Read an .xlsx or .csv upload into raw rows. Throws only on a file the parser cannot use. */
export async function parseCatalogueFile(buffer: Buffer, filename: string): Promise<RawRow[]> {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (ext === ".csv") {
    const sheet = await workbook.csv.read(Readable.from(buffer), {
      // Without this exceljs guesses types per cell and will turn a spec like "2026" into a
      // Date. Zod coerces the numbers we actually want, so keeping the text is strictly
      // safer than letting the CSV reader decide.
      map: (value: unknown) => value,
    });
    return worksheetToRows(sheet, filename);
  }

  if (ext !== ".xlsx" && ext !== ".xlsm") {
    throw new ApiError(400, "UNSUPPORTED_FILE", "Upload a .xlsx or .csv file");
  }

  try {
    // exceljs ships its own `declare interface Buffer extends ArrayBuffer` and it does not
    // structurally match Node's. The value is right; only the shim's type is wrong.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ApiError(400, "UNREADABLE_FILE", `${filename} could not be read as a spreadsheet`);
  }
  const sheet = workbook.worksheets.find((w) => w.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, "EMPTY_SHEET", `${filename} has no worksheets`);
  return worksheetToRows(sheet, filename);
}

// ---------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------

/**
 * Validate every row, collecting errors rather than throwing on the first.
 *
 * Row 4 being wrong must not hide row 90 — an operator who has to fix one typo per upload
 * round-trip gives up on the sheet and starts adding items by hand.
 */
export function validateRows(raw: RawRow[]): { valid: ValidRow[]; errors: RowError[] } {
  const valid: ValidRow[] = [];
  const errors: RowError[] = [];

  for (const { rowNumber, values } of raw) {
    const parsed = catalogueImportRowSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = String(issue.path[0] ?? "(row)");
        errors.push({
          row: rowNumber,
          column,
          value: values[column],
          message: issue.message,
        });
      }
      continue;
    }

    // The offer fields are optional as a group, not individually: a URL with no price
    // anchors nothing, and a price with no URL cannot be acted on. The schema cannot say
    // this per-field, so it is said here rather than letting a half-offer through.
    const offerFields = ["marketplace", "url", "priceRupees"] as const;
    const supplied = offerFields.filter((f) => parsed.data[f] !== undefined && parsed.data[f] !== null);
    if (supplied.length > 0 && supplied.length < offerFields.length) {
      for (const f of offerFields) {
        if (supplied.includes(f)) continue;
        errors.push({
          row: rowNumber,
          column: f,
          value: values[f],
          message: `An offer needs all of ${offerFields.join(", ")} — got only ${supplied.join(", ")}`,
        });
      }
      continue;
    }

    valid.push({ ...parsed.data, row: rowNumber });
  }

  return { valid, errors };
}

// ---------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------

export type FieldChange = { field: string; from: unknown; to: unknown };

export type OfferPlan = {
  row: number;
  action: "create" | "update" | "unchanged";
  marketplace: Marketplace;
  url: string;
  pricePaise: number;
  fromPricePaise?: number;
};

export type ItemPlan = {
  /** Every sheet row that fed this item. More than one means extra offers, not a duplicate. */
  rows: number[];
  slug: string;
  name: string;
  action: "create" | "update" | "unchanged";
  changes: FieldChange[];
  offers: OfferPlan[];
};

export type ImportOptions = {
  /** Default true. Nothing is written unless the caller explicitly says so. */
  dryRun?: boolean;
  /** Default false: one bad row refuses the whole sheet. */
  allowPartial?: boolean;
  /**
   * Errors from `validateRows`, handed back in so the all-or-nothing gate sees the whole
   * picture. Without them a caller could pass the 90 valid rows of a 100-row sheet and get
   * a commit that all-or-nothing was supposed to refuse.
   */
  priorErrors?: RowError[];
};

export type ImportResult = {
  dryRun: boolean;
  committed: boolean;
  /** Set when a commit was asked for and refused. */
  refusedReason?: string;
  created: number;
  updated: number;
  unchanged: number;
  /** Rows (not items) dropped because they carry an error. */
  skipped: number;
  offersCreated: number;
  offersUpdated: number;
  offersUnchanged: number;
  items: ItemPlan[];
  errors: RowError[];
};

type ItemData = {
  name: string;
  category: EquipmentCategory;
  spec: string | null;
  sportId: string | null;
  indicativePaise: number;
};

/** Rupees in the sheet, paise in the database. Rounded, never floated. */
function rupeesToPaiseInt(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Plan and optionally apply an import.
 *
 * The plan is computed first and in full, so a dry run and a commit see exactly the same
 * diff — the operator confirms what they were shown, not what a second pass decides.
 */
export async function importCatalogue(
  rows: ValidRow[],
  options: ImportOptions = {},
): Promise<ImportResult> {
  const dryRun = options.dryRun ?? true;
  const allowPartial = options.allowPartial ?? false;
  const errors: RowError[] = [...(options.priorErrors ?? [])];
  let skipped = 0;

  const sports = await prisma.sport.findMany({ select: { id: true, name: true, slug: true } });
  const sportByKey = new Map<string, { id: string; name: string }>();
  for (const s of sports) {
    sportByKey.set(s.name.trim().toLowerCase(), s);
    sportByKey.set(s.slug, s);
  }

  // Group by slug rather than by row: the same item legitimately appears twice when it has
  // an Amazon offer and a Flipkart one.
  const planBySlug = new Map<string, { data: ItemData; plan: ItemPlan; sport: string | null }>();
  const desiredOffers = new Map<string, { row: number; marketplace: Marketplace; url: string; pricePaise: number }[]>();

  for (const row of rows) {
    const rawSport = row.sport?.trim();
    let sportId: string | null = null;
    let sportName: string | null = null;
    if (rawSport) {
      const match = sportByKey.get(rawSport.toLowerCase());
      if (!match) {
        // A typo'd sport that silently becomes "no sport" is invisible data loss: the item
        // lands in the catalogue, disappears from every sport filter, and nobody finds out
        // until a coordinator cannot see the bat they asked for.
        errors.push({
          row: row.row,
          column: "sport",
          value: row.sport,
          message: `Unknown sport "${rawSport}". Known: ${sports.map((s) => s.name).join(", ")}`,
        });
        skipped++;
        continue;
      }
      sportId = match.id;
      sportName = match.name;
    }

    const slug = equipmentSlug({ name: row.name, category: row.category, sport: sportName });
    const data: ItemData = {
      name: row.name,
      category: row.category,
      spec: row.spec ?? null,
      sportId,
      indicativePaise: rupeesToPaiseInt(row.indicativeRupees),
    };

    const existing = planBySlug.get(slug);
    if (existing) {
      // Two rows claiming different prices for the same object is exactly the mistake the
      // slug key exists to catch. Taking either silently discards the other.
      const conflict = (["name", "category", "spec", "sportId", "indicativePaise"] as const).find(
        (f) => existing.data[f] !== data[f],
      );
      if (conflict) {
        // Report the sheet's own column name and cell value, not the database field — the
        // operator is looking at a spreadsheet, not at Prisma.
        const column =
          conflict === "sportId" ? "sport" : conflict === "indicativePaise" ? "indicativeRupees" : conflict;
        errors.push({
          row: row.row,
          column,
          value: row[column as keyof CatalogueImportRow],
          message: `Row ${existing.plan.rows[0]} already defines "${slug}" with a different ${column}`,
        });
        skipped++;
        continue;
      }
      existing.plan.rows.push(row.row);
    } else {
      planBySlug.set(slug, {
        data,
        sport: sportName,
        plan: { rows: [row.row], slug, name: row.name, action: "unchanged", changes: [], offers: [] },
      });
    }

    if (row.marketplace && row.url && row.priceRupees) {
      const list = desiredOffers.get(slug) ?? [];
      list.push({
        row: row.row,
        marketplace: row.marketplace,
        url: row.url,
        pricePaise: rupeesToPaiseInt(row.priceRupees),
      });
      desiredOffers.set(slug, list);
    }
  }

  const slugs = [...planBySlug.keys()];
  const existingItems = await prisma.equipmentItem.findMany({
    where: { slug: { in: slugs } },
    include: {
      // Admin-curated only. A supplier's own offer is theirs; a sheet upload must not
      // silently rewrite the price someone else published.
      offers: { where: { supplierId: null } },
    },
  });
  const existingBySlug = new Map(existingItems.map((i) => [i.slug, i]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let offersCreated = 0;
  let offersUpdated = 0;
  let offersUnchanged = 0;

  for (const [slug, entry] of planBySlug) {
    const existing = existingBySlug.get(slug);
    if (!existing) {
      entry.plan.action = "create";
      created++;
    } else {
      const changes: FieldChange[] = [];
      for (const field of ["name", "category", "spec", "sportId", "indicativePaise"] as const) {
        if (existing[field] !== entry.data[field]) {
          changes.push({ field, from: existing[field], to: entry.data[field] });
        }
      }
      entry.plan.changes = changes;
      entry.plan.action = changes.length > 0 ? "update" : "unchanged";
      if (changes.length > 0) updated++;
      else unchanged++;
    }

    // Offer identity is (item, marketplace, url) with no supplier. Re-importing the same
    // sheet must land on the same offer rather than stacking a second identical link.
    const seen = new Set<string>();
    for (const want of desiredOffers.get(slug) ?? []) {
      const key = `${want.marketplace} ${want.url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const match = existing?.offers.find(
        (o) => o.marketplace === want.marketplace && o.url === want.url,
      );
      if (!match) {
        entry.plan.offers.push({ ...want, action: "create" });
        offersCreated++;
      } else if (match.pricePaise !== want.pricePaise || !match.isActive) {
        entry.plan.offers.push({ ...want, action: "update", fromPricePaise: match.pricePaise });
        offersUpdated++;
      } else {
        entry.plan.offers.push({ ...want, action: "unchanged" });
        offersUnchanged++;
      }
    }
  }

  const items = [...planBySlug.values()].map((e) => e.plan);
  const result: ImportResult = {
    dryRun,
    committed: false,
    created,
    updated,
    unchanged,
    skipped,
    offersCreated,
    offersUpdated,
    offersUnchanged,
    items,
    errors,
  };

  if (dryRun) return result;
  if (errors.length > 0 && !allowPartial) {
    result.refusedReason = `${errors.length} row error(s) and --allow-partial was not set — nothing was written`;
    return result;
  }

  // One transaction: a sheet that applies half way leaves the operator guessing which half.
  // The default 5s interactive timeout is not enough for a few hundred upserts on a cold
  // connection, and timing out mid-sheet is the failure mode this is here to prevent.
  await prisma.$transaction(
    async (tx) => {
      for (const [slug, entry] of planBySlug) {
        const plan = entry.plan;
        let itemId = existingBySlug.get(slug)?.id;

        if (plan.action !== "unchanged") {
          // Same upsert shape as seedCatalogue, on the same key, deliberately: seeding and
          // importing must never produce two rows for one object. `isActive` is absent from
          // the update on purpose — an item an admin deactivated should not come back to
          // life because it is still sitting in an old sheet.
          const saved = await tx.equipmentItem.upsert({
            where: { slug },
            update: entry.data,
            create: { slug, ...entry.data },
          });
          itemId = saved.id;
        }
        if (!itemId) continue;

        for (const offer of plan.offers) {
          if (offer.action === "create") {
            await tx.supplierOffer.create({
              data: {
                equipmentItemId: itemId,
                supplierId: null,
                marketplace: offer.marketplace,
                url: offer.url,
                pricePaise: offer.pricePaise,
              },
            });
          } else if (offer.action === "update") {
            // checkedAt moves only when the price does. Re-running an unchanged sheet is a
            // re-run, not a fresh price check, and bumping the timestamp would launder a
            // stale price as freshly verified — the opposite of what the staleness badge
            // promises a donor.
            await tx.supplierOffer.updateMany({
              where: {
                equipmentItemId: itemId,
                supplierId: null,
                marketplace: offer.marketplace,
                url: offer.url,
              },
              data: { pricePaise: offer.pricePaise, isActive: true, checkedAt: new Date() },
            });
          }
        }
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  result.committed = true;
  return result;
}

// ---------------------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------------------

const COLUMN_NOTES: Record<keyof CatalogueImportRow, string> = {
  name: 'Precise enough to buy. "Cricket bat, English willow, size 6" — not "Bat".',
  category: `One of: ${EQUIPMENT_CATEGORIES.join(", ")}`,
  sport: "Must match a sport already in khelkhud. Leave blank for general items.",
  spec: "Size, weight, material — the detail that makes it buyable.",
  indicativeRupees: "What a donor should expect to pay, in RUPEES. This is the guard against overpaying.",
  marketplace: `Optional. With url and priceRupees, creates a curated link. One of: ${MARKETPLACES.join(", ")}`,
  url: "Optional. A working product link.",
  priceRupees: "Optional. The listed price at that link, in RUPEES.",
};

const EXAMPLE_ROW: Record<keyof CatalogueImportRow, string | number> = {
  name: "Cricket bat, Kashmir willow, size 6",
  category: "BAT",
  sport: "Cricket",
  spec: "Short handle, 1100-1200g. Entry level for under-16.",
  indicativeRupees: 1800,
  marketplace: "AMAZON",
  url: "https://www.amazon.in/dp/EXAMPLE",
  priceRupees: 1750,
};

/**
 * The blank sheet an admin fills in.
 *
 * Built from IMPORT_COLUMNS, which comes from the validator's own shape — so a field added
 * to `catalogueImportRowSchema` appears here without anyone remembering to add it. The
 * guidance sits in cell notes rather than an extra row, because a preamble row would shift
 * every row number and the error table's whole value is that its numbers match Excel's.
 */
export async function catalogueTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "khelkhud";
  const sheet = workbook.addWorksheet("catalogue");

  sheet.columns = IMPORT_COLUMNS.map((field) => ({
    header: field,
    key: field,
    width: field === "name" || field === "spec" || field === "url" ? 46 : 20,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell, col) => {
    const field = IMPORT_COLUMNS[col - 1];
    if (!field) return;
    const optional = catalogueImportRowSchema.shape[field].isOptional();
    cell.note = `${optional ? "Optional" : "Required"}. ${COLUMN_NOTES[field]}`;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.addRow(EXAMPLE_ROW);

  // Dropdowns on the two enum columns, sourced from the same constants the validator uses.
  // Cheaper to stop a typo in the cell than to explain it in an error table.
  const enumColumns: [keyof CatalogueImportRow, readonly string[]][] = [
    ["category", EQUIPMENT_CATEGORIES],
    ["marketplace", MARKETPLACES],
  ];
  for (const [field, allowed] of enumColumns) {
    const index = IMPORT_COLUMNS.indexOf(field) + 1;
    if (index === 0) continue;
    for (let row = 2; row <= 500; row++) {
      sheet.getCell(row, index).dataValidation = {
        type: "list",
        allowBlank: field === "marketplace",
        formulae: [`"${allowed.join(",")}"`],
      };
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
