import { config } from "../../config.js";

/**
 * Plain-TS email templates. Each takes the notification title/body and wraps
 * it in a consistent shell with a link back to the app.
 */
export function notificationEmail(input: {
  title: string;
  body: string;
  linkUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const link = input.linkUrl ? `${config.WEB_URL}${input.linkUrl}` : config.WEB_URL;
  return {
    subject: `khelkhud — ${input.title}`,
    text: `${input.title}\n\n${input.body}\n\nOpen khelkhud: ${link}`,
    html: `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:18px;font-weight:700;margin:0 0 4px">khel<span style="color:#16a34a">khud</span></p>
  <h2 style="font-size:16px;margin:16px 0 8px">${escapeHtml(input.title)}</h2>
  <p style="font-size:14px;color:#444;line-height:1.5">${escapeHtml(input.body)}</p>
  <p style="margin-top:24px">
    <a href="${link}" style="background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open khelkhud</a>
  </p>
</div>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
