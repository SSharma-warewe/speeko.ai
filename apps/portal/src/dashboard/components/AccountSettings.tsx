import { useEffect, useId, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Field, Input } from "@call-agent/ui";
import { ApiError, UnauthorizedError } from "../../lib/api";
import { formatDateTime, initialsFromName, shortId } from "../../lib/format";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

export type AccountDetail = {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
};

export type AccountWorkspace = {
  name: string;
  slug: string;
  id: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  description: string;
  displayName: string | null;
  email: string;
  roleLabel: string;
  statusActive: boolean;
  memberSince?: string | null;
  details: AccountDetail[];
  workspace?: AccountWorkspace;
  onSaveName: (name: string) => Promise<void>;
  onChangePassword: (data: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<{ ok: true }>;
  onLogout: () => void;
  onUnauthorized: () => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyValue({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <span className="ops-account-value">
      <span className={mono ? "ops-mono" : undefined} title={value}>
        {mono && value.length > 12 ? shortId(value, 10) : value}
      </span>
      <button type="button" className="ops-account-copy" onClick={() => void handleCopy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function PasswordField({
  id,
  label,
  hint,
  autoComplete,
  value,
  onChange,
  disabled,
  required,
}: {
  id: string;
  label: string;
  hint?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} htmlFor={id} required={required} hint={hint}>
      <div className="ops-pass-wrap">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="ops-pass-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}

export function AccountSettings({
  eyebrow = "You",
  title,
  description,
  displayName,
  email,
  roleLabel,
  statusActive,
  memberSince,
  details,
  workspace,
  onSaveName,
  onChangePassword,
  onLogout,
  onUnauthorized,
}: Props) {
  const ids = useId();
  const mark = initialsFromName(displayName, email);
  const headline = displayName?.trim() || email;

  const [nameDraft, setNameDraft] = useState(displayName ?? "");
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameOk, setNameOk] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passSubmitting, setPassSubmitting] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passOk, setPassOk] = useState(false);

  useEffect(() => {
    setNameDraft(displayName ?? "");
  }, [displayName]);

  const nameDirty = nameDraft.trim() !== (displayName ?? "").trim();

  const handleNameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameOk(false);
    const next = nameDraft.trim();
    if (!next) {
      setNameError("Display name is required.");
      return;
    }
    if (next.length > 255) {
      setNameError("Display name must be 255 characters or fewer.");
      return;
    }
    setNameSubmitting(true);
    try {
      await onSaveName(next);
      setNameOk(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setNameError(err instanceof ApiError ? err.message : "Could not update name.");
    } finally {
      setNameSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassOk(false);
    if (newPassword.length < 8) {
      setPassError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setPassError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setPassError("New password must be different from the current password.");
      return;
    }
    setPassSubmitting(true);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setPassOk(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setPassError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setPassSubmitting(false);
    }
  };

  return (
    <div className="ops-account">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <section className="ops-panel ops-account-hero">
        <div className="ops-account-hero-main">
          <span className="ops-account-mark" aria-hidden>
            {mark}
          </span>
          <div className="ops-account-identity">
            <h2>{headline}</h2>
            <p>{email}</p>
            <div className="ops-account-badges">
              <Badge tone="info">{roleLabel}</Badge>
              <StatusBadge
                status={statusActive ? "active" : "inactive"}
                label={statusActive ? "Active" : "Inactive"}
              />
            </div>
            {memberSince ? (
              <p className="ops-account-since">Member since {formatDateTime(memberSince)}</p>
            ) : null}
          </div>
        </div>
        {workspace ? (
          <dl className="ops-account-workspace">
            <div>
              <dt>Workspace</dt>
              <dd>{workspace.name}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd className="ops-mono">{workspace.slug}</dd>
            </div>
            <div>
              <dt>Organization ID</dt>
              <dd>
                <CopyValue value={workspace.id} mono />
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      <div className="ops-account-grid">
        <div className="ops-account-col">
          <section className="ops-panel">
            <div className="ops-panel-head">
              <h3>Display name</h3>
            </div>
            <div className="ops-panel-body">
              <form className="ops-form" onSubmit={handleNameSubmit} noValidate>
                {nameError ? <Alert tone="error">{nameError}</Alert> : null}
                {nameOk ? <Alert tone="success">Display name updated.</Alert> : null}
                <Field
                  label="Name shown in the sidebar"
                  htmlFor={`${ids}-name`}
                  hint="Email stays as your login. Name is what colleagues see."
                  required
                >
                  <Input
                    id={`${ids}-name`}
                    value={nameDraft}
                    onChange={(e) => {
                      setNameDraft(e.target.value);
                      setNameOk(false);
                    }}
                    autoComplete="name"
                    disabled={nameSubmitting}
                    maxLength={255}
                  />
                </Field>
                <div className="ops-form-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={nameSubmitting}
                    disabled={nameSubmitting || !nameDirty}
                  >
                    Save name
                  </Button>
                </div>
              </form>
            </div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel-head">
              <h3>Account details</h3>
            </div>
            <dl className="ops-account-dl">
              {details.map((row) => (
                <div key={row.label} className="ops-account-dl-row">
                  <dt>{row.label}</dt>
                  <dd>
                    {row.copy ? (
                      <CopyValue value={row.value} mono={row.mono} />
                    ) : (
                      <span className={row.mono ? "ops-mono" : undefined}>{row.value}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="ops-account-col">
          <section className="ops-panel">
            <div className="ops-panel-head">
              <h3>Password</h3>
            </div>
            <div className="ops-panel-body">
              <form className="ops-form" onSubmit={handlePasswordSubmit} noValidate>
                {passError ? <Alert tone="error">{passError}</Alert> : null}
                {passOk ? (
                  <Alert tone="success">
                    Password updated. A confirmation was sent to {email}.
                  </Alert>
                ) : null}
                <PasswordField
                  id={`${ids}-cur`}
                  label="Current password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  disabled={passSubmitting}
                  required
                />
                <PasswordField
                  id={`${ids}-new`}
                  label="New password"
                  hint="At least 8 characters. Must differ from the current password."
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  disabled={passSubmitting}
                  required
                />
                <PasswordField
                  id={`${ids}-conf`}
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={setConfirm}
                  disabled={passSubmitting}
                  required
                />
                <p className="ops-account-note">
                  Changing your password signs you in on this browser as usual. We’ll email{" "}
                  {email} to confirm the change.
                </p>
                <div className="ops-form-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={passSubmitting}
                    disabled={passSubmitting}
                  >
                    Update password
                  </Button>
                </div>
              </form>
            </div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel-head">
              <h3>Session</h3>
            </div>
            <div className="ops-panel-body">
              <p className="ops-account-note">
                Signed in as <strong>{email}</strong> in this browser. Signing out ends this
                session on this device only.
              </p>
              <div className="ops-form-actions">
                <Button type="button" variant="dangerGhost" onClick={onLogout}>
                  Sign out
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
