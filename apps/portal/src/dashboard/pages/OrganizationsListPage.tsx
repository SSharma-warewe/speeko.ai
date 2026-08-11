import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createOrganization,
  listOrganizations,
  UnauthorizedError,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { formatDateTime, slugify } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function OrganizationsListPage() {
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(listOrganizations, []);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !slug.trim()) {
      setFormError("Name and slug are required.");
      return;
    }
    setSubmitting(true);
    try {
      await createOrganization({ name: name.trim(), slug: slug.trim().toLowerCase() });
      setName("");
      setSlug("");
      setSlugTouched(false);
      setShowForm(false);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not create organization.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading organizations" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const orgs = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Tenants"
        title="Organizations"
        description="Create and open tenants. From an org you manage users, agents, SIP trunks, and dial queue settings."
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Create organization"}
          </Button>
        }
      />

      <section className="ops-panel">
        {showForm ? (
          <form className="ops-inline-form ops-form" onSubmit={handleCreate} noValidate>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <div className="ops-form-grid">
              <Field label="Name" htmlFor="org-name" required>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Acme Call Center"
                  disabled={submitting}
                />
              </Field>
              <Field
                label="Slug"
                htmlFor="org-slug"
                required
                hint="Lowercase letters, numbers, hyphens"
              >
                <Input
                  id="org-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="acme"
                  disabled={submitting}
                />
              </Field>
            </div>
            <div className="ops-form-actions">
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                Create organization
              </Button>
            </div>
          </form>
        ) : null}

        <div className="ops-panel-body is-flush">
          {orgs.length === 0 ? (
            <EmptyState
              title="No organizations yet"
              description="Create a tenant to assign agents, SIP trunks, and queue settings."
              action={
                !showForm ? (
                  <Button type="button" variant="primary" size="sm" onClick={() => setShowForm(true)}>
                    Create organization
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/admin-dashboard/organizations/${o.id}`}>{o.name}</Link>
                      </td>
                      <td className="ops-mono">{o.slug}</td>
                      <td>
                        <StatusBadge
                          status={o.isActive ? "active" : "inactive"}
                          label={o.isActive ? "Active" : "Inactive"}
                        />
                      </td>
                      <td className="ops-faint">{formatDateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
