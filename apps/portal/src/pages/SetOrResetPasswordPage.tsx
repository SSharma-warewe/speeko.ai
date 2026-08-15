import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  resetAdminPassword,
  resetUserPassword,
  setUserPassword,
} from "../lib/api";
import {
  getMarketingHomeUrl,
  isExternalMarketingUrl,
} from "../lib/marketing-url";
import { useVantaWaves } from "../lib/useVantaWaves";
import "./AdminLoginPage.css";

type Mode = "set" | "reset" | "admin-reset";

export default function SetOrResetPasswordPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [orgSlug, setOrgSlug] = useState(params.get("org") ?? "");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement>(null);
  useVantaWaves(shellRef);
  const marketingHome = getMarketingHomeUrl();
  const brandIsExternal = isExternalMarketingUrl(marketingHome);

  const title =
    mode === "set" ? "Set your password" : "Choose a new password";
  const loginTo = mode === "admin-reset" ? "/admin-login" : "/login";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This link is missing a token. Request a new one.");
      return;
    }
    if (mode !== "admin-reset" && !orgSlug.trim()) {
      setError("Organization slug is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "set") {
        await setUserPassword({
          email: email.trim(),
          organizationSlug: orgSlug.trim().toLowerCase(),
          token,
          newPassword: password,
        });
      } else if (mode === "reset") {
        await resetUserPassword({
          email: email.trim(),
          organizationSlug: orgSlug.trim().toLowerCase(),
          token,
          newPassword: password,
        });
      } else {
        await resetAdminPassword({
          email: email.trim(),
          token,
          newPassword: password,
        });
      }
      const next = new URLSearchParams();
      next.set("email", email.trim());
      if (mode !== "admin-reset") next.set("org", orgSlug.trim().toLowerCase());
      navigate(`${loginTo}?${next.toString()}`, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update password.",
      );
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
        <h1 className="admin-login__title">{title}</h1>
        <p className="admin-login__muted">
          {mode === "set"
            ? "Create a password to activate your Speeko account."
            : "Enter a new password for your account."}
        </p>

        <form className="admin-login__form" onSubmit={handleSubmit} noValidate>
          {error ? (
            <Alert tone="error" className="admin-login__alert">
              {error}
            </Alert>
          ) : null}
          {mode !== "admin-reset" ? (
            <Field label="Organization slug" htmlFor="pw-org" required>
              <Input
                id="pw-org"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                disabled={submitting}
              />
            </Field>
          ) : null}
          <Field label="Email" htmlFor="pw-email" required>
            <Input
              id="pw-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="New password" htmlFor="pw-new" required hint="Min 8 characters">
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="Confirm password" htmlFor="pw-confirm" required>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {mode === "set" ? "Set password" : "Update password"}
          </Button>
          <p className="admin-login__muted" style={{ marginBottom: 0 }}>
            <Link to={loginTo}>Back to login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
