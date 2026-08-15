import { RequestKind } from "@prisma/client";
import type { RequestItemInput } from "@khelkhud/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errors.js";

/**
 * The rule for linking a request line to the catalogue.
 *
 * Lives here rather than in a route because two routes raise requests — an athlete asking
 * for themselves, and a coordinator asking on someone's behalf — and they must agree.
 * Wave 2 briefly had a copy in each, with different error codes for the same fault, which
 * is how a rule quietly becomes two rules.
 */
export async function assertCatalogueLinks(
  kind: RequestKind,
  items: readonly RequestItemInput[],
): Promise<void> {
  const linked = items.filter((i) => i.equipmentItemId);
  if (linked.length === 0) return;

  // A CASH line pointing at the catalogue is a category error, not a typo. Cash is money
  // toward travel, coaching and entry fees; the catalogue names objects a donor buys and
  // ships. Allowing it would hang an indicative price off a bus fare and start blurring
  // the two tracks back into one — the merge tasks/supplier-catalogue.md §2a refused, and
  // the point at which "delivered" and "spent" stop meaning different things.
  if (kind !== RequestKind.EQUIPMENT) {
    throw new ApiError(
      400,
      "CATALOGUE_ON_CASH",
      `"${linked[0]!.label}" is a cash line, so it cannot be a catalogue item. Raise it as an equipment request, or drop the catalogue link.`,
    );
  }

  const ids = [...new Set(linked.map((i) => i.equipmentItemId!))];
  const live = await prisma.equipmentItem.findMany({
    // Inactive counts as missing: an item is retired precisely when nobody should be
    // pointed at it any more, so resolving one would resurrect it through the back door.
    where: { id: { in: ids }, isActive: true },
    select: { id: true },
  });
  const resolvable = new Set(live.map((i) => i.id));

  // Named by label, not id: the person is looking at a form full of labels, and a cuid in
  // an error message tells them nothing about which line to fix.
  const orphan = linked.find((i) => !resolvable.has(i.equipmentItemId!));
  if (orphan) {
    throw new ApiError(
      400,
      "UNKNOWN_CATALOGUE_ITEM",
      `"${orphan.label}" is linked to a catalogue item that no longer exists. Pick it again, or ask for it in your own words.`,
    );
  }
}
