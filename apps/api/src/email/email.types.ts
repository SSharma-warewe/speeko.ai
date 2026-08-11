export type SendEmailParams = {
  to: string | string[];
  subject: string;
  /** Plain text body (required if html is omitted). */
  text?: string;
  /** HTML body (optional). */
  html?: string;
  /** Override default EMAIL_FROM. */
  from?: string;
  replyTo?: string | string[];
  /** Optional Resend tags for filtering in the dashboard. */
  tags?: { name: string; value: string }[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };
