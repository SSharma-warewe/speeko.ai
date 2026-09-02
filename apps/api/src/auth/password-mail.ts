export function buildInviteEmail(params: {
  organizationName: string;
  setPasswordUrl: string;
  expiresLabel: string;
}): { subject: string; html: string } {
  return {
    subject: 'Set your Speeko password',
    html: wrapEmail(
      'Set your Speeko password',
      `<p>You've been invited to <strong>${escapeHtml(params.organizationName)}</strong> on Speeko.</p>
       <p>Choose a password to activate your account. This link expires in ${escapeHtml(params.expiresLabel)}.</p>
       <p><a href="${escapeHtml(params.setPasswordUrl)}">Set password</a></p>
       <p style="color:#666;font-size:13px">If the button does not work, paste this URL into your browser:<br>${escapeHtml(params.setPasswordUrl)}</p>`,
    ),
  };
}

export function buildResetEmail(params: {
  resetUrl: string;
  expiresLabel: string;
}): { subject: string; html: string } {
  return {
    subject: 'Reset your Speeko password',
    html: wrapEmail(
      'Reset your Speeko password',
      `<p>We received a request to reset your Speeko password.</p>
       <p>This link expires in ${escapeHtml(params.expiresLabel)}.</p>
       <p><a href="${escapeHtml(params.resetUrl)}">Reset password</a></p>
       <p style="color:#666;font-size:13px">If you did not ask for this, you can ignore this email.</p>
       <p style="color:#666;font-size:13px">If the button does not work, paste this URL into your browser:<br>${escapeHtml(params.resetUrl)}</p>`,
    ),
  };
}

export function buildPasswordChangedEmail(): { subject: string; html: string } {
  return {
    subject: 'Your Speeko password was changed',
    html: wrapEmail(
      'Your Speeko password was changed',
      `<p>The password on your Speeko account was just updated.</p>
       <p>If this was not you, reset your password from the login page and contact your administrator.</p>`,
    ),
  };
}

function wrapEmail(title: string, inner: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <h1 style="font-size:20px">${escapeHtml(title)}</h1>
  ${inner}
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
