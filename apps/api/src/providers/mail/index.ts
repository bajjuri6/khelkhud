import { config } from "../../config.js";
import { consoleMailer } from "./console.js";
import { sesMailer } from "./ses.js";
import type { Mailer } from "./types.js";

export const mailer: Mailer = config.mail.sesEnabled ? sesMailer : consoleMailer;

export type { Mailer, MailInput } from "./types.js";
