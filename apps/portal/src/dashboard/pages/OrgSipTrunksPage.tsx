import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createSipTrunk,
  deleteSipTrunk,
  listSipTrunks,
  UnauthorizedError,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

type Mode = "link" | "provision";

export default function OrgSipTrunksPage() {
  const { orgId = "" } = useParams();
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(() => listSipTrunks(orgId), [orgId]);

  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<Mode>("link");
  const [name, setName] = useState("");
  const [numbers, setNumbers] = useState("");
  const [livekitTrunkId, setLivekitTrunkId] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setNumbers("");
    setLivekitTrunkId("");
    setProviderAddress("");
    setAuthUsername("");
    setAuthPassword("");
    setMode("link");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const numberList = numbers
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!name.trim() || numberList.length === 0) {
      setFormError("Name and at least one phone number are required.");
      return;
    }
    if (mode === "link" && !livekitTrunkId.trim()) {
      setFormError("LiveKit trunk id (ST_…) is required when linking.");
      return;
    }
    if (mode === "provision" && !providerAddress.trim()) {
      setFormError("Provider address is required when provisioning.");
      return;
    }

    setSubmitting(true);
    try {
      await createSipTrunk(orgId, {
        name: name.trim(),
        numbers: numberList,
        ...(mode === "link"
          ? { livekitTrunkId: livekitTrunkId.trim() }
          : {
              providerAddress: providerAddress.trim(),
              authUsername: authUsername.trim() || undefined,
              authPassword: authPassword || undefined,
            }),
      });
      resetForm();
      setShowForm(false);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not create trunk.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this local SIP trunk row? LiveKit resource is not deleted.")) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteSipTrunk(orgId, id);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      window.alert(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <LoadingBlock label="Loading SIP trunks" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const trunks = data ?? [];

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>SIP trunks</h2>
        <Button type="button" variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add outbound trunk"}
        </Button>
      </div>

      {showForm ? (
        <form className="ops-inline-form ops-form" onSubmit={handleCreate} noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="ops-mode-toggle" role="group" aria-label="Create mode">
            <button
              type="button"
              className={`ops-mode-btn${mode === "link" ? " is-active" : ""}`}
              onClick={() => setMode("link")}
            >
              Link existing
            </button>
            <button
              type="button"
              className={`ops-mode-btn${mode === "provision" ? " is-active" : ""}`}
              onClick={() => setMode("provision")}
            >
              Provision new
            </button>
          </div>
          <div className="ops-form-grid">
            <Field label="Name" htmlFor="trunk-name" required>
              <Input
                id="trunk-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                placeholder="Primary outbound"
              />
            </Field>
            <Field
              label="Numbers"
              htmlFor="trunk-numbers"
              required
              hint="Comma or newline separated (E.164)"
            >
              <Input
                id="trunk-numbers"
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                disabled={submitting}
                placeholder="+15551234567"
              />
            </Field>
            {mode === "link" ? (
              <Field label="LiveKit trunk id" htmlFor="trunk-lk" required hint="ST_…">
                <Input
                  id="trunk-lk"
                  value={livekitTrunkId}
                  onChange={(e) => setLivekitTrunkId(e.target.value)}
                  disabled={submitting}
                  placeholder="ST_…"
                />
              </Field>
            ) : (
              <>
                <Field label="Provider address" htmlFor="trunk-provider" required>
                  <Input
                    id="trunk-provider"
                    value={providerAddress}
                    onChange={(e) => setProviderAddress(e.target.value)}
                    disabled={submitting}
                    placeholder="sip.telnyx.com"
                  />
                </Field>
                <Field label="Auth username" htmlFor="trunk-user">
                  <Input
                    id="trunk-user"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    disabled={submitting}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Auth password" htmlFor="trunk-pass" hint="Never shown again">
                  <Input
                    id="trunk-pass"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                </Field>
              </>
            )}
          </div>
          <div className="ops-form-actions">
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
              Create trunk
            </Button>
          </div>
        </form>
      ) : null}

      <div className="ops-panel-body is-flush">
        {trunks.length === 0 ? (
          <EmptyState
            title="No SIP trunks"
            description="Link an existing LiveKit outbound trunk or provision one with provider credentials."
          />
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th>Numbers</th>
                  <th>LiveKit</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {trunks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td>
                      <StatusBadge status={t.direction} />
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="ops-mono">{t.numbers?.join(", ") || "—"}</td>
                    <td className="ops-mono">{t.livekitTrunkId || "—"}</td>
                    <td className="ops-faint">{formatDateTime(t.createdAt)}</td>
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={deletingId === t.id}
                        disabled={deletingId === t.id}
                        onClick={() => handleDelete(t.id)}
                      >
                        Delete
                      </Button>
                    </td>
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
