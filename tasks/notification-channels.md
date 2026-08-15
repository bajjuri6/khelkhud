# Notification channels, and telling coordinators a request arrived

## Why

khelkhud is a **web app only**. There is no native app, so there is no push channel — a
person finds out something happened either by visiting the site, or because we emailed
them. The in-app bell is a convenience for people already looking; it is not delivery.

Today `notify()` writes a `Notification` row and emails only for types listed in an
`EMAIL_WORTHY` set. `SYSTEM` is excluded, and any type added later is excluded **by
default and silently** — the wrong default when email is the only real channel.

Concretely broken: when an athlete raises a request, the coordinator who must validate it
is told nothing. They discover it by happening to open the dashboard. In a village where
the coordinator is a PET teacher checking the site once a week, an athlete waits a week
for a decision that takes ten seconds.

## Decisions

**Email is the only implemented channel.** SMS and WhatsApp are named in the types so the
decision point exists and is cheap to flip, but they are not built — per-message cost
makes them a business call, not a technical one. An unimplemented channel logs and no-ops;
it never silently drops.

**Channel policy is an exhaustive map, not a set.** `Record<NotificationType, Channel[]>`
over the Prisma enum means adding a notification type is a *compile error* until someone
decides how it reaches a human. That is the whole point: the current bug is a type that
defaults to invisible.

**One new type: `REQUEST_SUBMITTED`.** The type names the event, not the recipient — the
same event goes to the village coordinator, or to admins when the village has none. That
keeps it aligned with the admin fallback queue rather than inventing a parallel concept.

**No digesting.** A coordinator covers a handful of villages and sees a few requests a
week. Batching adds delay and state for a volume problem we do not have. Revisit if a
village ever generates enough to be annoying.

## Plan

1. `schema.prisma`: add `REQUEST_SUBMITTED` to `NotificationType`. Additive, so it is safe
   against the deploy-ordering flaw (new enum + old code is harmless).
2. `notify.ts`: replace `EMAIL_WORTHY` with the exhaustive channel map; add `notifyMany`
   for fan-out to several recipients without N awaited round-trips.
3. `athletes.ts`: on request creation, notify the active coordinators covering the village;
   if none, notify admins, and say in the copy that the village is uncovered.
4. Verify: a coordinator gets a row **and** an email; an uncovered village routes to admins
   instead; the console mailer shows both in dev.

## Not doing

- SMS/WhatsApp providers.
- Per-user channel preferences. Nobody has asked to opt out of the four emails we send,
  and an unsubscribe surface is real work; revisit before any volume increase.
- Notifying sponsors when a request opens in a village they follow — that needs
  `SponsorVillage`, which does not exist yet. Separate task.
