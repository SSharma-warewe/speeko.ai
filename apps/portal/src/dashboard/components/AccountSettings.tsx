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

const HIDDEN_FACT_LABELS = new Set(["email", "role"]);

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
      <button
        type="button"
        className="ops-account-copy"
        onClick={() => void handleCopy()}
        aria-label={copied ? "Copied" : `Copy ${value}`}
      >
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

  const facts: AccountDetail[] = [
    ...(workspace
      ? [
          { label: "Workspace", value: workspace.name },
          { label: "Slug", value: workspace.slug, mono: true },
          {
            label: "Organization ID",
            value: workspace.id,
            mono: true,
            copy: true,
          },
        ]
      : []),
    ...details.filter((row) => !HIDDEN_FACT_LABELS.has(row.label.toLowerCase())),
    ...(memberSince
      ? [{ label: "Member since", value: formatDateTime(memberSince) }]
      : []),
  ];

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

      <section className="ops-panel ops-account-plate">
        <div className="ops-account-who">
          <span className="ops-account-mark" aria-hidden>
            {mark}
          </span>
          <div className="ops-account-identity">
            <h2>{headline}</h2>
            <p title={email}>{email}</p>
            <div className="ops-account-badges">
              <Badge tone="info">{roleLabel}</Badge>
              <StatusBadge
                status={statusActive ? "active" : "inactive"}
                label={statusActive ? "Active" : "Inactive"}
              />
            </div>
          </div>
        </div>

        {facts.length > 0 ? (
          <dl className="ops-account-facts">
            {facts.map((row) => (
              <div key={row.label} className="ops-account-fact">
                <dt>{row.label}</dt>
                <dd>
                  {row.copy ? (
                    <CopyValue value={row.value} mono={row.mono} />
                  ) : (
                    <span
                      className={row.mono ? "ops-mono" : "ops-account-fact-value"}
                      title={row.value}
                    >
                      {row.value}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <div className="ops-account-work">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <div className="ops-account-panel-title">
              <h3>Profile</h3>
              <p>Name shown on this desk. Email stays as your login.</p>
            </div>
          </div>
          <div className="ops-panel-body">
            <form className="ops-form ops-account-form" onSubmit={handleNameSubmit} noValidate>
              {nameError ? <Alert tone="error">{nameError}</Alert> : null}
              {nameOk ? <Alert tone="success">Display name updated.</Alert> : null}
              <Field
                label="Display name"
                htmlFor={`${ids}-name`}
                hint="What colleagues see in the sidebar."
                required
              >
                <div className="ops-account-name-row">
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
                  <Button
                    type="submit"
                    variant="primary"
                    loading={nameSubmitting}
                    disabled={nameSubmitting || !nameDirty}
                  >
                    Save
                  </Button>
                </div>
              </Field>
              <Field
                label="Login email"
                htmlFor={`${ids}-email`}
                hint="Used to sign in. Not editable here."
              >
                <Input
                  id={`${ids}-email`}
                  value={email}
                  readOnly
                  autoComplete="username"
                />
              </Field>
            </form>
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <div className="ops-account-panel-title">
              <h3>Sign-in</h3>
              <p>Change the password for this browser session.</p>
            </div>
          </div>
          <div className="ops-panel-body">
            <form className="ops-form ops-account-form" onSubmit={handlePasswordSubmit} noValidate>
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
                We’ll email {email} to confirm the change. Other devices stay signed in.
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
      </div>

      <section className="ops-panel ops-account-session">
        <p className="ops-account-note">
          Signed in as <strong>{email}</strong> in this browser. Signing out ends this
          session on this device only.
        </p>
        <Button type="button" variant="secondary" onClick={onLogout}>
          Sign out
        </Button>
      </section>
    </div>
  );
}
