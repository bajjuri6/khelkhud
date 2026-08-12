export type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface Mailer {
  name: "SES" | "CONSOLE";
  send(input: MailInput): Promise<void>;
}
