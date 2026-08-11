import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createUserOutboundTrunk,
  deleteUserOutboundTrunk,
  listUserOutboundTrunks,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";
import InboundTelephonyPanel from "./InboundTelephonyPanel";

type Mode = "link" | "provision";
type Tab = "outbound" | "inbound";

function OutboundTrunksPanel() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(
    () => listUserOutboundTrunks(),
    [],
  );

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
      await createUserOutboundTrunk({
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

  const handleDelete = async (trunkId: string) => {
    if (!window.confirm("Delete this local SIP trunk row? LiveKit resource is not deleted.")) {
      return;
    }
    setDeletingId(trunkId);
    try {
      await deleteUserOutboundTrunk(trunkId);
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
    <div className="ops-stack">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
        >
          {showForm ? "Close form" : "Add trunk"}
        </Button>
      </div>

      {showForm ? (
        <section className="ops-panel ops-form-shell ops-form-shell--narrow">
          <div className="ops-panel-head">
            <h2>Add outbound trunk</h2>
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleCreate}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}

            <div className="ops-mode-toggle" role="group" aria-label="Create mode">
              <button
                type="button"
                className={`ops-mode-btn${mode === "link" ? " is-active" : ""}`}
                onClick={() => setMode("link")}
                disabled={submitting}
              >
                Link ST_…
              </button>
              <button
                type="button"
                className={`ops-mode-btn${mode === "provision" ? " is-active" : ""}`}
                onClick={() => setMode("provision")}
                disabled={submitting}
              >
                Provision
              </button>
            </div>

            <Field label="Name" htmlFor="sip-name" required>
              <Input
                id="sip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                placeholder="Primary outbound"
              />
            </Field>
            <Field
              label="Numbers"
              htmlFor="sip-nums"
              required
              hint="Comma or newline separated, E.164 preferred"
            >
              <Input
                id="sip-nums"
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                disabled={submitting}
                placeholder="+918065179684"
              />
            </Field>

            {mode === "link" ? (
              <Field label="LiveKit trunk id" htmlFor="sip-lk" required hint="ST_…">
                <Input
                  id="sip-lk"
                  value={livekitTrunkId}
                  onChange={(e) => setLivekitTrunkId(e.target.value)}
                  disabled={submitting}
                  placeholder="ST_…"
                />
              </Field>
            ) : (
              <>
                <Field label="Provider address" htmlFor="sip-prov" required>
                  <Input
                    id="sip-prov"
                    value={providerAddress}
                    onChange={(e) => setProviderAddress(e.target.value)}
                    disabled={submitting}
                    placeholder="sip.telnyx.com"
                  />
                </Field>
                <div className="ops-form-grid">
                  <Field label="Auth username" htmlFor="sip-user">
                    <Input
                      id="sip-user"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      disabled={submitting}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Auth password" htmlFor="sip-pass">
                    <Input
                      id="sip-pass"
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      disabled={submitting}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
              </>
            )}

            <div className="ops-form-actions">
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                Create trunk
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="ops-panel">
        <div className="ops-panel-body is-flush">
          {trunks.length === 0 ? (
            <EmptyState
              title="No outbound trunks"
              description="Add a trunk before enqueueing or dialing SIP calls."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Numbers</th>
                    <th>LiveKit id</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {trunks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {!t.isActive ? (
                          <span className="ops-faint"> · inactive</span>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="ops-mono" style={{ maxWidth: 180 }}>
                        {t.numbers?.join(", ") || "—"}
                      </td>
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
    </div>
  );
}

export default function UserSipTrunksPage() {
  const [tab, setTab] = useState<Tab>("outbound");

  return (
    <div>
      <PageHeader
        eyebrow="Configure"
        title="SIP / Telephony"
        description="Outbound trunks for dials, and inbound draft → publish (trunks + dispatch rules) for LiveKit routing."
      />

      <div
        className="ops-mode-toggle"
        role="tablist"
        aria-label="Telephony direction"
        style={{ marginBottom: "1rem" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "outbound"}
          className={`ops-mode-btn${tab === "outbound" ? " is-active" : ""}`}
          onClick={() => setTab("outbound")}
        >
          Outbound trunks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbound"}
          className={`ops-mode-btn${tab === "inbound" ? " is-active" : ""}`}
          onClick={() => setTab("inbound")}
        >
          Inbound publish
        </button>
      </div>

      {tab === "outbound" ? <OutboundTrunksPanel /> : <InboundTelephonyPanel />}
    </div>
  );
}
