"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_URL, ApiClientError } from "@/lib/api";

/**
 * One entry in a plan bucket, when the server sends detail rather than a bare count.
 *
 * Both shapes are accepted: a bucket may be a number, or a list of the rows it covers.
 * Detail is what makes "updated" reviewable instead of a number the operator has to
 * take on faith, so it is rendered whenever it arrives.
 */
type PlanEntry = {
  row?: number;
  slug?: string;
  name?: string;
  changes?: { field: string; from?: unknown; to?: unknown }[];
};

type PlanBucket = number | PlanEntry[] | null | undefined;

type ImportError = {
  row: number;
  column: string;
  value?: string | number | boolean | null;
  message: string;
};

type ImportPlan = {
  created: PlanBucket;
  updated: PlanBucket;
  unchanged: PlanBucket;
  skipped: PlanBucket;
  offersCreated: PlanBucket;
  errors?: ImportError[];
};

function count(bucket: PlanBucket): number {
  if (typeof bucket === "number") return bucket;
  if (Array.isArray(bucket)) return bucket.length;
  return 0;
}

function entries(bucket: PlanBucket): PlanEntry[] {
  return Array.isArray(bucket) ? bucket : [];
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/**
 * Upload the sheet.
 *
 * A raw fetch rather than `apiClient`, which forces `Content-Type: application/json`.
 * The body is the file's bytes, not multipart: the upload carries one file and no other
 * fields, so the server takes the flags as query params and needs no multipart parser.
 *
 * Commit re-posts the same bytes with `commit=true`. The plan the operator approved is
 * derived from those bytes, so sending them again is what guarantees the commit applies to
 * the sheet they actually reviewed rather than to server state that may have moved.
 */
async function postImport(
  file: File,
  opts: { commit?: boolean; allowPartial?: boolean } = {},
): Promise<ImportPlan> {
  const params = new URLSearchParams({ filename: file.name });
  if (opts.commit) params.set("commit", "true");
  if (opts.allowPartial) params.set("allowPartial", "true");

  const res = await fetch(`${API_URL}/api/admin/catalogue/import?${params}`, {
    method: "POST",
    credentials: "include",
    headers: {
      // Falling back to octet-stream keeps .csv and .xlsx on the same path; the server
      // decides how to parse from the filename, not from a header a browser may guess.
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: ImportPlan; error?: { code?: string; message?: string } }
    | ImportPlan
    | null;

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? "UNKNOWN", err?.message ?? res.statusText);
  }
  const envelope = json as { data?: ImportPlan } | null;
  return (envelope?.data ?? (json as ImportPlan)) ?? ({} as ImportPlan);
}

function PlanTile({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: number;
  tone?: "alarm";
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${tone === "alarm" ? "text-destructive" : ""}`}
        data-numeric
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * Bulk import: template, dry run, review, commit.
 *
 * A click never goes straight to a write. Choosing a file only ever produces a plan; the
 * commit button does not exist until a dry run has come back, and it names the number of
 * changes it is about to make. If any row failed validation the commit is blocked until
 * the operator explicitly accepts a partial apply — the default is all-or-nothing, because
 * an import that silently half-applies is worse than one that refuses.
 */
export function ImportPanel() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [allowPartial, setAllowPartial] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = plan?.errors ?? [];
  const created = count(plan?.created);
  const updated = count(plan?.updated);
  const unchanged = count(plan?.unchanged);
  const skipped = count(plan?.skipped);
  const offersCreated = count(plan?.offersCreated);
  const updatedEntries = entries(plan?.updated);
  const writes = created + updated + offersCreated;
  const blocked = errors.length > 0 && !allowPartial;

  function reset() {
    setFile(null);
    setPlan(null);
    setAllowPartial(false);
    setShowUpdates(false);
    setFailure(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function pick(next: File | null) {
    // A plan belongs to the bytes it was computed from. Swapping the file must not leave a
    // stale plan on screen next to a commit button.
    setFile(next);
    setPlan(null);
    setAllowPartial(false);
    setShowUpdates(false);
    setFailure(null);
  }

  async function dryRun() {
    if (!file) return;
    setChecking(true);
    setFailure(null);
    try {
      const result = await postImport(file);
      setPlan(result);
      setAllowPartial(false);
    } catch (err) {
      setPlan(null);
      setFailure(
        err instanceof ApiClientError
          ? err.message
          : "Could not reach the server. Nothing was imported.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function commit() {
    if (!file || !plan || blocked) return;
    setCommitting(true);
    setFailure(null);
    try {
      const result = await postImport(file, { commit: true, allowPartial });
      const madeItems = count(result.created) + count(result.updated);
      const madeOffers = count(result.offersCreated);
      toast.success(
        `Imported: ${madeItems} item${madeItems === 1 ? "" : "s"}, ${madeOffers} offer${
          madeOffers === 1 ? "" : "s"
        }`,
      );
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setFailure(
        err instanceof ApiClientError
          ? err.message
          : "Could not reach the server. Check the catalogue before uploading again.",
      );
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">Import a sheet</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Add or correct many items at once from an .xlsx or .csv. Nothing is written
                until you have seen exactly what would change.
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>Import</Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">Import a sheet</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Every upload is checked first and reported back to you. Committing is a
                  separate, deliberate second step.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Close
              </Button>
            </div>

            {/* ── Template ────────────────────────────────────────────────── */}
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm font-medium">Start from the template</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                The template is generated by the same code that validates your upload, so
                the two cannot disagree about a column name or an allowed value. Prices in
                it are in rupees, not paise.
              </p>
              <a
                href={`${API_URL}/api/admin/catalogue/import/template`}
                className="mt-3 inline-block text-sm font-medium text-marigold underline-offset-4 hover:underline"
              >
                Download the template (.xlsx)
              </a>
            </div>

            {/* ── File ────────────────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label htmlFor="import-file">Sheet</Label>
              <Input
                id="import-file"
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv"
                className="h-10"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Re-uploading a sheet you have already imported is safe and expected. Rows
                are matched on a slug built from sport, category and name, so a second
                upload updates the item that is already there instead of creating a second
                copy of it. If a sheet was wrong, fix the sheet and upload it again — that
                is the intended way to correct an import.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void dryRun()} disabled={!file || checking}>
                {checking ? "Checking…" : plan ? "Check again" : "Check this sheet"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Reads the file and reports what would change. Writes nothing.
              </span>
            </div>

            {failure ? <p className="text-sm text-destructive">{failure}</p> : null}

            {/* ── The plan ────────────────────────────────────────────────── */}
            {plan ? (
              <div className="grid gap-4 border-t border-border pt-5">
                <div>
                  <p className="text-lg font-semibold">What this sheet would do</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing below has happened yet.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <PlanTile
                    label="Created"
                    value={created}
                    note="New items. Nothing in the catalogue matches these rows."
                  />
                  <PlanTile
                    label="Updated"
                    value={updated}
                    note="Already in the catalogue, and this sheet says something different."
                  />
                  <PlanTile
                    label="Unchanged"
                    value={unchanged}
                    note="Matched and identical. Left exactly as they are."
                  />
                  <PlanTile
                    label="Skipped"
                    value={skipped}
                    tone={skipped > 0 ? "alarm" : undefined}
                    note="Not applied — see the errors below for why."
                  />
                </div>

                {offersCreated > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Plus <span data-numeric>{offersCreated}</span> buying link
                    {offersCreated === 1 ? "" : "s"} from the marketplace and price columns.
                  </p>
                ) : null}

                {/* ── Updated, explorable ───────────────────────────────── */}
                {updated > 0 ? (
                  <div className="rounded-lg border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <p className="text-sm">
                        <span data-numeric>{updated}</span> existing item
                        {updated === 1 ? "" : "s"} will be overwritten with this sheet&rsquo;s
                        values. Anything not named in the sheet is left alone.
                      </p>
                      {updatedEntries.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowUpdates((s) => !s)}
                        >
                          {showUpdates ? "Hide" : "Show what changes"}
                        </Button>
                      ) : null}
                    </div>

                    {showUpdates && updatedEntries.length > 0 ? (
                      <div className="overflow-x-auto border-t border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">Row</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Field</TableHead>
                              <TableHead>Now</TableHead>
                              <TableHead>After import</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {updatedEntries.flatMap((entry, i) => {
                              const changes = entry.changes ?? [];
                              const label = entry.name ?? entry.slug ?? "—";
                              if (changes.length === 0) {
                                return [
                                  <TableRow key={entry.slug ?? entry.row ?? i}>
                                    <TableCell data-numeric>{cell(entry.row)}</TableCell>
                                    <TableCell className="font-medium">{label}</TableCell>
                                    <TableCell
                                      className="text-muted-foreground"
                                      colSpan={3}
                                    >
                                      Differs from the sheet
                                    </TableCell>
                                  </TableRow>,
                                ];
                              }
                              return changes.map((change, j) => (
                                <TableRow key={`${entry.slug ?? i}-${change.field}-${j}`}>
                                  <TableCell data-numeric>
                                    {j === 0 ? cell(entry.row) : ""}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {j === 0 ? label : ""}
                                  </TableCell>
                                  <TableCell>{change.field}</TableCell>
                                  <TableCell className="text-muted-foreground line-through">
                                    {cell(change.from)}
                                  </TableCell>
                                  <TableCell>{cell(change.to)}</TableCell>
                                </TableRow>
                              ));
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* ── Errors ────────────────────────────────────────────── */}
                {errors.length > 0 ? (
                  <div className="grid gap-3">
                    <div>
                      <p className="text-sm font-semibold text-destructive">
                        <span data-numeric>{errors.length}</span> problem
                        {errors.length === 1 ? "" : "s"} in this sheet
                      </p>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                        Every row was checked, not just the first bad one. Row numbers match
                        what you see in Excel.
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead className="w-40">Column</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Why</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {errors.map((e, i) => (
                            <TableRow key={`${e.row}-${e.column}-${i}`}>
                              <TableCell data-numeric>{e.row}</TableCell>
                              <TableCell className="font-medium">{e.column}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {cell(e.value)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {e.message}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <label className="flex max-w-2xl items-start gap-2.5 rounded-lg border border-border bg-muted p-4 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-marigold"
                        checked={allowPartial}
                        onChange={(e) => setAllowPartial(e.target.checked)}
                      />
                      <span>
                        Import the valid rows anyway
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          The <span data-numeric>{created + updated}</span> row
                          {created + updated === 1 ? "" : "s"} that passed will be written.
                          The <span data-numeric>{errors.length}</span> listed above will be
                          skipped entirely — not partly saved, not defaulted — and will stay
                          missing from the catalogue until you fix them in the sheet and
                          upload it again. Leave this unticked and the whole import refuses.
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}

                {/* ── Commit ────────────────────────────────────────────── */}
                {writes === 0 && errors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Every row in this sheet already matches the catalogue. There is nothing
                    to commit.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                    <Button onClick={() => void commit()} disabled={blocked || committing}>
                      {committing ? "Importing…" : `Commit ${writes} change${writes === 1 ? "" : "s"}`}
                    </Button>
                    <span className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                      {blocked
                        ? "Blocked while this sheet has errors. Fix them and check again, or tick the box above to import only the valid rows."
                        : `Writes ${created} new item${created === 1 ? "" : "s"}, ${updated} update${
                            updated === 1 ? "" : "s"
                          } and ${offersCreated} buying link${
                            offersCreated === 1 ? "" : "s"
                          }. Recorded against your name.`}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
