/**
 * Bulk catalogue import from the command line.
 *
 *   pnpm --filter @khelkhud/api import:catalogue <file.xlsx|file.csv> [--commit] [--allow-partial]
 *   pnpm --filter @khelkhud/api import:catalogue --template catalogue-template.xlsx
 *
 * Dry run by default: it prints exactly what would change and writes nothing. `--commit`
 * is the only thing that touches the database, and without `--allow-partial` a single bad
 * row refuses the whole sheet.
 *
 * Needs DATABASE_URL, like the other scripts — the package script wraps it in dotenv.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma.js";
import {
  catalogueTemplateBuffer,
  importCatalogue,
  parseCatalogueFile,
  validateRows,
  type ImportResult,
  type RowError,
} from "../src/services/catalogue-import.js";

function truncate(value: unknown, max: number): string {
  const s =
    value === undefined || value === null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** row | column | value | why — the table the spec asks for, sorted the way the sheet reads. */
function printErrors(errors: RowError[]): void {
  const rows = [...errors].sort((a, b) => a.row - b.row || a.column.localeCompare(b.column));
  const cells = rows.map((e) => [
    String(e.row),
    e.column,
    truncate(e.value, 30),
    truncate(e.message, 78),
  ]);
  const head = ["row", "column", "value", "why"];
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => (c[i] ?? "").length)));
  const line = (c: string[]) => c.map((v, i) => v.padEnd(widths[i] ?? 0)).join("  ");

  console.error(`\n${rows.length} error(s):\n`);
  console.error(line(head));
  console.error(widths.map((w) => "-".repeat(w)).join("  "));
  for (const c of cells) console.error(line(c));
}

function printPlan(result: ImportResult): void {
  const changed = result.items.filter((i) => i.action !== "unchanged" || i.offers.some((o) => o.action !== "unchanged"));

  if (changed.length > 0) {
    console.log("\nChanges:\n");
    for (const item of changed) {
      const rows = item.rows.join(",");
      if (item.action === "create") {
        console.log(`  + [row ${rows}] ${item.slug}  "${item.name}"`);
      } else if (item.action === "update") {
        console.log(`  ~ [row ${rows}] ${item.slug}`);
        for (const c of item.changes) {
          console.log(`      ${c.field}: ${truncate(c.from, 40)} -> ${truncate(c.to, 40)}`);
        }
      } else {
        // The item itself is untouched; it is listed because an offer under it moved.
        console.log(`  = [row ${rows}] ${item.slug}`);
      }
      for (const offer of item.offers) {
        if (offer.action === "create") {
          console.log(`      + offer ${offer.marketplace} ${(offer.pricePaise / 100).toFixed(2)} ${offer.url}`);
        } else if (offer.action === "update") {
          const from = ((offer.fromPricePaise ?? 0) / 100).toFixed(2);
          console.log(`      ~ offer ${offer.marketplace} ${from} -> ${(offer.pricePaise / 100).toFixed(2)}`);
        }
      }
    }
  }

  console.log(
    `\nItems:  ${result.created} created, ${result.updated} updated, ` +
      `${result.unchanged} unchanged, ${result.skipped} row(s) skipped`,
  );
  console.log(
    `Offers: ${result.offersCreated} created, ${result.offersUpdated} updated, ` +
      `${result.offersUnchanged} unchanged`,
  );
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const commit = argv.includes("--commit");
  const allowPartial = argv.includes("--allow-partial");
  const templateIndex = argv.indexOf("--template");

  if (templateIndex !== -1) {
    const out = argv[templateIndex + 1] ?? "catalogue-template.xlsx";
    writeFileSync(out, await catalogueTemplateBuffer());
    console.log(`Wrote template to ${path.resolve(out)}`);
    return 0;
  }

  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: import-catalogue <file.xlsx|file.csv> [--commit] [--allow-partial]");
    console.error("       import-catalogue --template [out.xlsx]");
    return 2;
  }

  const raw = await parseCatalogueFile(readFileSync(file), file);
  const { valid, errors } = validateRows(raw);
  console.log(`Parsed ${raw.length} row(s) from ${path.basename(file)}`);

  const result = await importCatalogue(valid, {
    dryRun: !commit,
    allowPartial,
    priorErrors: errors,
  });

  printPlan(result);
  if (result.errors.length > 0) printErrors(result.errors);

  if (result.dryRun) {
    console.log(
      result.errors.length > 0 && !allowPartial
        ? "\nDry run. Nothing written. Fix the rows above, or re-run with --commit --allow-partial to apply the valid ones."
        : "\nDry run. Nothing written. Re-run with --commit to apply.",
    );
  } else if (result.committed) {
    console.log("\nCommitted.");
  } else {
    console.error(`\nRefused: ${result.refusedReason}`);
  }

  // Non-zero on any validation failure, so CI and a shell `&&` both notice. A refused
  // commit is a failure too — the operator asked for a write that did not happen.
  if (result.errors.length > 0) return 1;
  return result.dryRun || result.committed ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
