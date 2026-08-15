export type SendEmailParams = {
  to: string | string[];
  subject: string;
  /** Plain text body (required if html is omitted). Converted to HTML for Plunk. */
  text?: string;
  /** HTML body (optional). */
  html?: string;
  /** Override default EMAIL_FROM. */
  from?: string;
  replyTo?: string | string[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };
