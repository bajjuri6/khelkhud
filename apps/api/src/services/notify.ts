import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { mailer } from "../providers/mail/index.js";
import { notificationEmail } from "../providers/mail/templates.js";

const EMAIL_WORTHY: ReadonlySet<NotificationType> = new Set([
  "SPONSORSHIP_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PLAYER_UPDATE",
  "VERIFICATION_RESULT",
  "INFO_REQUESTED",
]);

/**
 * Writes an in-app notification and fire-and-forgets an email for
 * email-worthy types (SES when configured, console log otherwise).
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: { title: string; body: string; linkUrl?: string },
): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: { userId, type, ...payload },
    });
    if (!EMAIL_WORTHY.has(type)) return;
    void (async () => {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return;
        await mailer.send({ to: user.email, ...notificationEmail(payload) });
        await prisma.notification.update({
          where: { id: notification.id },
          data: { emailedAt: new Date() },
        });
      } catch (err) {
        logger.error(err, "Failed to email notification");
      }
    })();
  } catch (err) {
    logger.error(err, "Failed to write notification");
  }
}
