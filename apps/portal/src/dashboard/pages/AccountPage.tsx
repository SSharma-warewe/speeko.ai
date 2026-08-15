import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import { ApiError, UnauthorizedError, changeAdminPassword } from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { PageHeader } from "../components/PageHeader";

export default function AdminAccountPage() {
  const { logout } = useAdminAuth();
  return (
    <ChangePasswordForm
      title="Account"
      description="Update the password for this platform admin."
      onSubmit={changeAdminPassword}
      onUnauthorized={logout}
    />
  );
}

export function ChangePasswordForm({
  title,
  description,
  onSubmit,
  onUnauthorized,
}: {
  title: string;
  description: string;
  onSubmit: (data: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<{ ok: true }>;
  onUnauthorized: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setOk(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title={title} description={description} />
      <section className="ops-panel" style={{ maxWidth: 480 }}>
        <form className="ops-form" onSubmit={handleSubmit} noValidate>
          {error ? <Alert tone="error">{error}</Alert> : null}
          {ok ? <Alert tone="success">Password updated.</Alert> : null}
          <Field label="Current password" htmlFor="cur-pass" required>
            <Input
              id="cur-pass"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="New password" htmlFor="new-pass" required hint="Min 8 characters">
            <Input
              id="new-pass"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="conf-pass" required>
            <Input
              id="conf-pass"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <div className="ops-form-actions">
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
              Update password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
