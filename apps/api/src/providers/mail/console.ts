import { logger } from "../../lib/logger.js";
import type { Mailer } from "./types.js";

/** Dev fallback: prints emails to the API log instead of sending. */
export const consoleMailer: Mailer = {
  name: "CONSOLE",
  async send({ to, subject, text }) {
    logger.info({ to, subject, body: text }, "📧 [console-mailer] email");
  },
};
