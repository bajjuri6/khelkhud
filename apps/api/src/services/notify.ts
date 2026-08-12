import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Writes an in-app notification. Email delivery is layered on in Phase 7 —
 * callers should not need to change.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: { title: string; body: string; linkUrl?: string },
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type, ...payload },
    });
  } catch (err) {
    logger.error(err, "Failed to write notification");
  }
}
