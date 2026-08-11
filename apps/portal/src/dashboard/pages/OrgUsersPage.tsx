import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createOrgUser,
  listOrgUsers,
  UnauthorizedError,
  type OrgUser,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

const ROLES: OrgUser["role"][] = ["org_admin", "agent", "supervisor"];

export default function OrgUsersPage() {
  const { orgId = "" } = useParams();
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(() => listOrgUsers(orgId), [orgId]);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<OrgUser["role"]>("agent");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError("Email and password are required.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await createOrgUser(orgId, {
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        role,
      });
      setEmail("");
      setPassword("");
      setName("");
      setRole("agent");
      setShowForm(false);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading users" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const users = data ?? [];

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>Members</h2>
        <Button type="button" variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add user"}
        </Button>
      </div>

      {showForm ? (
        <form className="ops-inline-form ops-form" onSubmit={handleCreate} noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="ops-form-grid">
            <Field label="Email" htmlFor="user-email" required>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Password" htmlFor="user-password" required hint="Min 8 characters">
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Name" htmlFor="user-name">
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Role" htmlFor="user-role">
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as OrgUser["role"])}
                disabled={submitting}
                style={{
                  width: "100%",
                  height: 40,
                  padding: "0 0.75rem",
                  borderRadius: 8,
                  border: "1px solid var(--ops-line)",
                  font: "inherit",
                  background: "#fff",
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="ops-form-actions">
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
              Create user
            </Button>
          </div>
        </form>
      ) : null}

      <div className="ops-panel-body is-flush">
        {users.length === 0 ? (
          <EmptyState
            title="No users"
            description="Add an org member so they can log in with the organization slug."
          />
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name || "—"}</td>
                    <td className="ops-mono">{u.role}</td>
                    <td>
                      <StatusBadge
                        status={u.isActive ? "active" : "inactive"}
                        label={u.isActive ? "Active" : "Inactive"}
                      />
                    </td>
                    <td className="ops-faint">{formatDateTime(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
