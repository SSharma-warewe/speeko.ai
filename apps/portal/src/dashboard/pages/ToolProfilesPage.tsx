import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createToolProfile,
  deleteToolProfile,
  KNOWN_TOOL_IDS,
  listToolProfiles,
  UnauthorizedError,
  updateToolProfile,
  type ToolProfile,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { useAsync } from "../hooks/useAsync";

function formatTools(p: ToolProfile): string {
  return p.toolIds?.length ? p.toolIds.join(", ") : "—";
}

export default function ToolProfilesPage() {
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(listToolProfiles, []);

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
        await updateToolProfile(editingId, {
          name: name.trim(),
          description: description.trim() || null,
          toolIds,
        });
        setActionMsg("Platform profile updated.");
      } else {
        await createToolProfile({
          name: name.trim(),
          key: key.trim() || undefined,
          description: description.trim() || undefined,
          toolIds,
        });
        setActionMsg("Platform profile created. Orgs can select it when assigning agents.");
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
        `Delete platform profile “${p.name}” (${p.key})? Fails if agents or templates still use it.`,
      )
    ) {
      return;
    }
    setBusyId(p.id);
    setActionMsg(null);
    try {
      await deleteToolProfile(p.id);
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

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Tool profiles"
        description="Create and manage platform capability bundles of worker tool ids. Orgs also create their own customs; both appear when assigning agents."
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
            <h2>
              {editingId ? "Edit platform profile" : "Create platform profile"}
            </h2>
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleSubmit}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <div className="ops-form-grid">
              <Field label="Name" htmlFor="admin-tp-name" required>
                <Input
                  id="admin-tp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="Support lite"
                />
              </Field>
              <Field
                label="Key"
                htmlFor="admin-tp-key"
                hint={
                  editingId
                    ? "Key cannot be changed after create"
                    : "Optional slug; auto from name if empty. Unique in platform catalog."
                }
              >
                <Input
                  id="admin-tp-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={submitting || Boolean(editingId)}
                  placeholder="support-lite"
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="admin-tp-desc">
              <Input
                id="admin-tp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                placeholder="Hangup + transfer only"
              />
            </Field>
            <Field
              label="Tools"
              htmlFor="admin-tp-tools"
              required
              hint="endCall is always included. Only known worker registry ids."
            >
              <div id="admin-tp-tools" className="ops-check-row" role="group">
                {KNOWN_TOOL_IDS.map((toolId) => {
                  const locked = toolId === "endCall";
                  const checked = locked || selectedTools.includes(toolId);
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

      <section className="ops-panel" style={{ marginTop: "1rem" }}>
        <div className="ops-panel-head">
          <h2>Platform catalog</h2>
        </div>
        <div className="ops-panel-body is-flush">
          {profiles.length === 0 ? (
            <EmptyState
              title="No profiles"
              description="Create a platform profile or wait for seed (default / outbound) on API boot."
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
                  {profiles.map((p) => (
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
    </div>
  );
}
