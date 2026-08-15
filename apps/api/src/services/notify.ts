import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { mailer } from "../providers/mail/index.js";
import { notificationEmail } from "../providers/mail/templates.js";

/**
 * How a notification reaches a human.
 *
 * khelkhud is a web app. There is no native app and therefore no push channel: someone
 * learns that something happened either by visiting the site, or because we emailed them.
 * The in-app bell is a convenience for people already looking — it is not delivery.
 *
 * `sms` and `whatsapp` are named but not implemented. Per-message cost makes them a
 * business decision rather than a technical one, so the type exists to make the decision
 * point visible and cheap to flip later. An unimplemented channel logs and no-ops; it
 * never silently drops a message.
 */
type Channel = "inApp" | "email" | "sms" | "whatsapp";

/**
 * Every notification type must say how it reaches someone.
 *
 * This is an exhaustive Record rather than a set of "email-worthy" types on purpose:
 * adding a value to the Prisma enum is a compile error here until someone decides. The
 * previous shape defaulted new types to in-app only, which on a web app means invisible —
 * that is exactly how coordinators ended up never being told a request was waiting.
 */
const CHANNELS: Record<NotificationType, readonly Channel[]> = {
  // Money moved, or someone is waiting on a human. All of these need to leave the site.
  SPONSORSHIP_RECEIVED: ["inApp", "email"],
  PAYMENT_CONFIRMED: ["inApp", "email"],
  VERIFICATION_RESULT: ["inApp", "email"],
  INFO_REQUESTED: ["inApp", "email"],
  REQUEST_SUBMITTED: ["inApp", "email"],
  ATHLETE_UPDATE: ["inApp", "email"],
  // Housekeeping the recipient did not ask for. In-app only, deliberately — emailing it
  // trains people to ignore mail from us, which costs us the four above.
  SYSTEM: ["inApp"],
};

async function deliverEmail(
  userId: string,
  notificationId: string,
  payload: { title: string; body: string; linkUrl?: string },
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, isActive: true },
    });
    // Not emailing a deactivated account: the row is still written so the history stays
    // intact if they are ever restored.
    if (!user || !user.isActive) return;
    await mailer.send({ to: user.email, ...notificationEmail(payload) });
    await prisma.notification.update({
      where: { id: notificationId },
      data: { emailedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to email notification");
  }
}

/**
 * Notify one person. Writes the in-app row, then fans out to the other channels for that
 * type. Never throws: a failed notification must not fail the action that caused it.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: { title: string; body: string; linkUrl?: string },
): Promise<void> {
  try {
    const channels = CHANNELS[type];
    const notification = await prisma.notification.create({
      data: { userId, type, ...payload },
    });

    for (const channel of channels) {
      switch (channel) {
        case "inApp":
          break; // the row above is the delivery
        case "email":
          void deliverEmail(userId, notification.id, payload);
          break;
        case "sms":
        case "whatsapp":
          logger.info(
            { userId, type, channel },
            "Channel not implemented; notification delivered in-app and by email only",
          );
          break;
      }
    }
  } catch (err) {
    logger.error({ err, userId, type }, "Failed to write notification");
  }
}

/**
 * Notify several people about the same thing.
 *
 * Used for fan-out to the coordinators covering a village. Concurrent rather than
 * sequential — with one coordinator it is identical, and the sequential version quietly
 * becomes an N-round-trip stall the day a village has several.
 */
export async function notifyMany(
  userIds: readonly string[],
  type: NotificationType,
  payload: { title: string; body: string; linkUrl?: string },
): Promise<void> {
  const unique = [...new Set(userIds)];
  await Promise.all(unique.map((id) => notify(id, type, payload)));
}
