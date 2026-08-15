import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Field, Input, Spinner } from "@call-agent/ui";
import { useAdminAuth } from "../lib/auth";
import {
  getMarketingHomeUrl,
  isExternalMarketingUrl,
} from "../lib/marketing-url";
import { useVantaWaves } from "../lib/useVantaWaves";
import "./AdminLoginPage.css";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function AdminLoginPage() {
  const { admin, loading, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from: string }).from.startsWith("/admin-dashboard")
      ? (location.state as { from: string }).from
      : "/admin-dashboard";

  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement>(null);
  useVantaWaves(shellRef);
  const marketingHome = getMarketingHomeUrl();
  const brandIsExternal = isExternalMarketingUrl(marketingHome);

  if (admin) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your admin email and password.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
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

          <h1 className="admin-login__title">Admin login</h1>
          <p className="admin-login__muted">
            Platform ops desk. Use your seeded admin credentials to manage
            organizations, agents, and SIP.
          </p>

          <form className="admin-login__form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <Alert tone="error" className="admin-login__alert">
                {error}
              </Alert>
            ) : null}

            <Field label="Email" htmlFor="admin-email" required>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                error={Boolean(error)}
              />
            </Field>

            <Field label="Password" htmlFor="admin-password" required>
              <Input
                id="admin-password"
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
            <p className="admin-login__muted" style={{ margin: 0 }}>
              <Link to="/admin-forgot-password">Forgot password?</Link>
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
