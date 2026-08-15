import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import { ApiError, forgotAdminPassword, forgotUserPassword } from "../lib/api";
import {
  getMarketingHomeUrl,
  isExternalMarketingUrl,
} from "../lib/marketing-url";
import { useVantaWaves } from "../lib/useVantaWaves";
import "./AdminLoginPage.css";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordPage({ admin = false }: { admin?: boolean }) {
  const [params] = useSearchParams();
  const [orgSlug, setOrgSlug] = useState(params.get("org") ?? "");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  useVantaWaves(shellRef);
  const marketingHome = getMarketingHomeUrl();
  const brandIsExternal = isExternalMarketingUrl(marketingHome);
  const loginTo = admin ? "/admin-login" : "/login";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!admin && !orgSlug.trim()) {
      setError("Enter your organization slug.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      if (admin) {
        await forgotAdminPassword(email.trim());
      } else {
        await forgotUserPassword(email.trim(), orgSlug.trim().toLowerCase());
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send email.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login" ref={shellRef}>
      <div className="admin-login__card">
        {brandIsExternal ? (
          <a className="admin-login__brand" href={marketingHome}>
            Speeko
          </a>
        ) : (
          <Link className="admin-login__brand" to={marketingHome}>
            Speeko
          </Link>
        )}
        <h1 className="admin-login__title">Forgot password</h1>
        <p className="admin-login__muted">
          {admin
            ? "If an admin account exists, we will email a reset link."
            : "If an account exists, we will email a reset or invite link."}
        </p>

        {sent ? (
          <div className="admin-login__success">
            <Alert tone="success">
              If an account exists, we sent a link to {email.trim()}.
            </Alert>
            <p className="admin-login__muted" style={{ marginTop: "1.25rem" }}>
              <Link to={loginTo}>Back to login</Link>
            </p>
          </div>
        ) : (
          <form className="admin-login__form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <Alert tone="error" className="admin-login__alert">
                {error}
              </Alert>
            ) : null}
            {!admin ? (
              <Field label="Organization slug" htmlFor="forgot-org" required>
                <Input
                  id="forgot-org"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  disabled={submitting}
                />
              </Field>
            ) : null}
            <Field label="Email" htmlFor="forgot-email" required>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitting}
            >
              Send link
            </Button>
            <p className="admin-login__muted" style={{ marginBottom: 0 }}>
              <Link to={loginTo}>Back to login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
