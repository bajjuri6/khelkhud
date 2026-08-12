import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { config } from "../../config.js";
import type { Mailer } from "./types.js";

let _client: SESv2Client | null = null;
function client(): SESv2Client {
  _client ??= new SESv2Client({ region: config.AWS_REGION });
  return _client;
}

export const sesMailer: Mailer = {
  name: "SES",
  async send({ to, subject, html, text }) {
    await client().send(
      new SendEmailCommand({
        FromEmailAddress: config.MAIL_FROM,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: html, Charset: "UTF-8" },
              Text: { Data: text, Charset: "UTF-8" },
            },
          },
        },
      }),
    );
  },
};
