import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createUserToolProfile,
  deleteUserToolProfile,
  KNOWN_TOOL_IDS,
  TOOL_ID_HINTS,
  listUserToolProfiles,
  UnauthorizedError,
  updateUserToolProfile,
  type ToolProfile,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

function formatTools(p: ToolProfile): string {
  return p.toolIds?.length ? p.toolIds.join(", ") : "—";
}

export default function UserToolProfilesPage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(
    () => listUserToolProfiles(),
    [],
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>(["endCall"]);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setKey("");
    setDescription("");
    setSelectedTools(["endCall"]);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
    setActionMsg(null);
  };

  const openEdit = (p: ToolProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setKey(p.key);
    setDescription(p.description || "");
    setSelectedTools(
      p.toolIds?.length ? [...new Set(["endCall", ...p.toolIds])] : ["endCall"],
    );
    setShowForm(true);
    setFormError(null);
    setActionMsg(null);
  };

  const toggleTool = (toolId: string) => {
    if (toolId === "endCall") return;
    setSelectedTools((prev) =>
      prev.includes(toolId)
        ? prev.filter((t) => t !== toolId)
        : [...prev, toolId],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionMsg(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const toolIds = [...new Set(["endCall", ...selectedTools])];
    setSubmitting(true);
    try {
      if (editingId) {
        await updateUserToolProfile(editingId, {
          name: name.trim(),
          description: description.trim() || null,
          toolIds,
        });
        setActionMsg("Profile updated.");
      } else {
        await createUserToolProfile({
          name: name.trim(),
          key: key.trim() || undefined,
          description: description.trim() || undefined,
          toolIds,
        });
        setActionMsg("Profile created. Assign it on an agent under Agents.");
      }
      resetForm();
      setShowForm(false);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(
        err instanceof ApiError ? err.message : "Could not save tool profile.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p: ToolProfile) => {
    if (
      !window.confirm(
        `Delete custom profile “${p.name}”? Agents using it must switch first.`,
      )
    ) {
      return;
    }
    setBusyId(p.id);
    setActionMsg(null);
    try {
      await deleteUserToolProfile(p.id);
      setActionMsg("Profile deleted.");
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not delete profile.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingBlock label="Loading tool profiles" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const profiles = data ?? [];
  const platform = profiles.filter((p) => p.isPlatform !== false && !p.organizationId);
  const custom = profiles.filter((p) => p.organizationId || p.isPlatform === false);

  return (
    <div>
      <PageHeader
        eyebrow="Configure"
        title="Tool profiles"
        description="Create custom capability bundles (worker tool ids), then assign a profile on an agent. Platform seeds are read-only."
        actions={
          <Button type="button" variant="primary" size="sm" onClick={openCreate}>
            {showForm && !editingId ? "Close form" : "Create profile"}
          </Button>
        }
      />

      {actionMsg ? <Alert tone="info">{actionMsg}</Alert> : null}

      {showForm ? (
        <section className="ops-panel ops-form-shell">
          <div className="ops-panel-head">
            <h2>{editingId ? "Edit custom profile" : "Create custom profile"}</h2>
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleSubmit}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <div className="ops-form-grid">
              <Field label="Name" htmlFor="tp-name" required>
                <Input
                  id="tp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="Sales lite"
                />
              </Field>
              <Field
                label="Key"
                htmlFor="tp-key"
                hint={
                  editingId
                    ? "Key cannot be changed after create"
                    : "Optional slug; auto from name if empty"
                }
              >
                <Input
                  id="tp-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={submitting || Boolean(editingId)}
                  placeholder="sales-lite"
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="tp-desc">
              <Input
                id="tp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                placeholder="Booking + hangup only"
              />
            </Field>
            <Field
              label="Tools"
              htmlFor="tp-tools"
              required
              hint="endCall is always included. Calendar tools need a Nylas connection linked on the agent."
            >
              <div id="tp-tools" className="ops-check-row" role="group">
                {KNOWN_TOOL_IDS.map((toolId) => {
                  const locked = toolId === "endCall";
                  const checked = locked || selectedTools.includes(toolId);
                  const hint = TOOL_ID_HINTS[toolId];
                  return (
                    <label key={toolId} className="ops-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={submitting || locked}
                        onChange={() => toggleTool(toolId)}
                      />
                      <span className="ops-mono">{toolId}</span>
                      {locked ? (
                        <span className="ops-faint"> (required)</span>
                      ) : hint ? (
                        <span className="ops-faint"> — {hint}</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </Field>
            <div className="ops-form-actions">
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={submitting}
              >
                {editingId ? "Save changes" : "Create profile"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="ops-stack" style={{ marginTop: "1rem" }}>
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Your custom profiles</h2>
          </div>
          <div className="ops-panel-body is-flush">
            {custom.length === 0 ? (
              <EmptyState
                title="No custom profiles yet"
                description="Create a profile with only the tools you need, then select it on an agent."
              />
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Key</th>
                      <th>Tools</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {custom.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          {p.description ? (
                            <div className="ops-faint" style={{ fontSize: "0.8rem" }}>
                              {p.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="ops-mono">{p.key}</td>
                        <td className="ops-mono" style={{ maxWidth: 280 }}>
                          {formatTools(p)}
                        </td>
                        <td>
                          <div className="ops-row-actions">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={busyId === p.id}
                              onClick={() => openEdit(p)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={busyId === p.id}
                              disabled={busyId === p.id}
                              onClick={() => handleDelete(p)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Platform catalog</h2>
          </div>
          <div className="ops-panel-body is-flush">
            {platform.length === 0 ? (
              <EmptyState
                title="No platform profiles"
                description="Seeded profiles appear after API boot."
              />
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Key</th>
                      <th>Tools</th>
                      <th>Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platform.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          {p.description ? (
                            <div className="ops-faint" style={{ fontSize: "0.8rem" }}>
                              {p.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="ops-mono">{p.key}</td>
                        <td className="ops-mono" style={{ maxWidth: 280 }}>
                          {formatTools(p)}
                        </td>
                        <td>
                          <StatusBadge status="live" label="Platform" />
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
    </div>
  );
}
