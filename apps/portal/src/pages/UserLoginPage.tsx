import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input, Spinner } from "@call-agent/ui";
import { useUserAuth } from "../lib/auth";
import {
  getMarketingHomeUrl,
  isExternalMarketingUrl,
} from "../lib/marketing-url";
import { useVantaWaves } from "../lib/useVantaWaves";
import "./AdminLoginPage.css";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function UserLoginPage() {
  const { user, loading, login } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from: string }).from.startsWith("/dashboard")
      ? (location.state as { from: string }).from
      : "/dashboard";

  const [orgSlug, setOrgSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement>(null);
  useVantaWaves(shellRef);
  const marketingHome = getMarketingHomeUrl();
  const brandIsExternal = isExternalMarketingUrl(marketingHome);

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!orgSlug.trim() || !email.trim() || !password) {
      setError("Enter organization slug, email, and password.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password, orgSlug.trim().toLowerCase());
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={shellRef} className="admin-login">
      {loading ? (
        <div
          className="admin-login__card"
          style={{ display: "grid", placeItems: "center", minHeight: 180 }}
        >
          <Spinner size="lg" label="Checking session" />
        </div>
      ) : (
        <div className="admin-login__card">
          <a
            href={marketingHome}
            className="admin-login__brand"
            {...(brandIsExternal
              ? { rel: "noopener noreferrer" }
              : undefined)}
          >
            Speeko
          </a>

          <h1 className="admin-login__title">Log in</h1>
          <p className="admin-login__muted">
            Organization ops desk. Run agents, manage the dial queue, and place
            outbound calls for your tenant.
          </p>

          <form className="admin-login__form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <Alert tone="error" className="admin-login__alert">
                {error}
              </Alert>
            ) : null}

            <Field label="Organization slug" htmlFor="user-org" required>
              <Input
                id="user-org"
                type="text"
                autoComplete="organization"
                placeholder="acme"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                disabled={submitting}
                error={Boolean(error)}
              />
            </Field>

            <Field label="Email" htmlFor="user-email" required>
              <Input
                id="user-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                error={Boolean(error)}
              />
            </Field>

            <Field label="Password" htmlFor="user-password" required>
              <Input
                id="user-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                error={Boolean(error)}
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
              Log in
            </Button>
          </form>

          <p
            className="admin-login__muted"
            style={{ marginTop: "1.25rem", marginBottom: 0 }}
          >
            Platform admin? <Link to="/admin-login">Admin login →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
