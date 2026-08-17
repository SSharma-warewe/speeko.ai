import { useMemo, useState, type FormEvent } from "react";
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
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type ScopeFilter = "all" | "custom" | "platform";

const SHORT_HINTS: Record<string, string> = {
  endCall: "Required hangup",
  booking: "Stub book",
  cancelBooking: "Stub cancel",
  transferCall: "Transfer",
  lookupCustomer: "Lookup",
  confirmAppointment: "Stub confirm",
  checkCalendarAvailability: "Nylas free/busy",
  listCalendarEvents: "Nylas list",
  createCalendarEvent: "Nylas create",
  cancelCalendarEvent: "Nylas cancel",
  checkGhlFreeSlots: "GHL open slots (org link)",
  scheduleGhlMeeting: "GHL book (org link)",
};

const TOOL_GROUPS: { label: string; ids: readonly string[] }[] = [
  { label: "Session", ids: ["endCall", "transferCall", "lookupCustomer"] },
  { label: "Booking stubs", ids: ["booking", "cancelBooking", "confirmAppointment"] },
  {
    label: "Nylas",
    ids: [
      "checkCalendarAvailability",
      "listCalendarEvents",
      "createCalendarEvent",
      "cancelCalendarEvent",
    ],
  },
  { label: "GHL", ids: ["checkGhlFreeSlots", "scheduleGhlMeeting"] },
];

function groupedToolIds(): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const group of TOOL_GROUPS) {
    for (const id of group.ids) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  for (const id of KNOWN_TOOL_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

function isCustom(p: ToolProfile): boolean {
  return Boolean(p.organizationId) || p.isPlatform === false;
}

function ToolPills({ ids }: { ids?: string[] }) {
  const tools = (ids ?? []).filter(Boolean);
  if (tools.length === 0) return <span className="ops-faint">—</span>;
  const shown = tools.slice(0, 3);
  const extra = tools.length - shown.length;
  return (
    <div className="ops-pills">
      {shown.map((id) => (
        <span key={id} className="ops-pill">
          {id}
        </span>
      ))}
      {extra > 0 ? <span className="ops-pill is-more">+{extra}</span> : null}
    </div>
  );
}

export default function UserToolProfilesPage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(
    () => listUserToolProfiles(),
    [],
  );

  const [scope, setScope] = useState<ScopeFilter>("all");
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

  const openEdit = (p: ToolProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setKey(p.key);
    setDescription(p.description || "");
    setSelectedTools(
      p.toolIds?.length ? [...new Set(["endCall", ...p.toolIds])] : ["endCall"],
    );
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
        setActionMsg("Profile created. Assign it on an agent.");
      }
      resetForm();
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
      if (editingId === p.id) resetForm();
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

  const profiles = data ?? [];
  const custom = profiles.filter(isCustom);
  const platform = profiles.filter((p) => !isCustom(p));
  const visible = useMemo(() => {
    if (scope === "custom") return custom;
    if (scope === "platform") return platform;
    return [...custom, ...platform];
  }, [scope, custom, platform]);

  if (loading && !data) return <LoadingBlock label="Loading tool profiles" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const groupedIds = groupedToolIds();
  const leftover = groupedIds.filter(
    (id) => !TOOL_GROUPS.some((g) => g.ids.includes(id)),
  );
  const groups =
    leftover.length > 0
      ? [...TOOL_GROUPS, { label: "Other", ids: leftover }]
      : TOOL_GROUPS;

  return (
    <div className="ops-desk">
      <div className="ops-desk-toolbar">
        <div className="ops-desk-toolbar-main">
          <h1>Tool profiles</h1>
          <div className="ops-mode-toggle" role="tablist" aria-label="Profile scope">
            {(
              [
                ["all", "All"],
                ["custom", "Custom"],
                ["platform", "Platform"],
              ] as const
            ).map(([keyName, label]) => (
              <button
                key={keyName}
                type="button"
                role="tab"
                aria-selected={scope === keyName}
                className={`ops-mode-btn${scope === keyName ? " is-active" : ""}`}
                onClick={() => setScope(keyName)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="ops-desk-counts">
          <li>
            <span className="ops-desk-stat">
              <strong>{custom.length}</strong>
              <span>custom</span>
            </span>
          </li>
          <li>
            <span className="ops-desk-stat">
              <strong>{platform.length}</strong>
              <span>platform</span>
            </span>
          </li>
        </ul>
      </div>

      <div className="ops-desk-board">
        <section className="ops-panel ops-desk-compose">
          <div className="ops-panel-head">
            <span className="ops-desk-kicker">
              {editingId ? "Edit profile" : "New profile"}
            </span>
            <span className="ops-desk-hint">
              {selectedTools.length} tools · endCall locked
            </span>
          </div>
          <form
            className="ops-panel-body ops-form ops-desk-form ops-desk-form-rack"
            onSubmit={handleSubmit}
          >
            <div className="ops-desk-form-top">
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {actionMsg ? <Alert tone="info">{actionMsg}</Alert> : null}

            <Field label="Name" htmlFor="tp-name" required>
              <Input
                id="tp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                placeholder="Sales lite"
              />
            </Field>
            <div className="ops-desk-pair">
              <Field
                label="Key"
                htmlFor="tp-key"
                hint={editingId ? "Locked" : "Auto if empty"}
              >
                <Input
                  id="tp-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={submitting || Boolean(editingId)}
                  placeholder="sales-lite"
                />
              </Field>
              <Field label="Note" htmlFor="tp-desc">
                <Input
                  id="tp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  placeholder="Booking + hangup"
                />
              </Field>
            </div>
            </div>

            <div className="ops-tool-groups ops-desk-form-scroll" role="group" aria-label="Tools">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="ops-tool-group-label">{group.label}</p>
                  <div className="ops-tool-grid">
                    {group.ids.map((toolId) => {
                      const locked = toolId === "endCall";
                      const checked = locked || selectedTools.includes(toolId);
                      return (
                        <label
                          key={toolId}
                          className={`ops-tool-chip${checked ? " is-on" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={submitting || locked}
                            onChange={() => toggleTool(toolId)}
                          />
                          <span className="ops-tool-chip-copy">
                            <span className="ops-tool-chip-id">{toolId}</span>
                            <span className="ops-tool-chip-hint">
                              {SHORT_HINTS[toolId] ||
                                TOOL_ID_HINTS[toolId] ||
                                "Worker tool"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="ops-desk-form-foot">
              <div className="ops-desk-submit">
                <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                  {editingId ? "Save profile" : "Create profile"}
                </Button>
              </div>
              {editingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={resetForm}
                >
                  New instead
                </Button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="ops-panel ops-desk-list">
          <div className="ops-desk-list-bar">
            <div className="ops-desk-list-bar-main">
              <span className="ops-desk-kicker">Catalog</span>
              <span className="ops-desk-hint">{visible.length} shown</span>
            </div>
          </div>
          <div className="ops-panel-body is-flush ops-desk-list-body">
            {visible.length === 0 ? (
              <EmptyState
                title="No profiles in this filter"
                description="Create a custom bundle on the left, or switch to Platform."
              />
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table ops-desk-table">
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>Tools</th>
                      <th>Scope</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const customRow = isCustom(p);
                      return (
                        <tr
                          key={p.id}
                          className={editingId === p.id ? "is-live" : undefined}
                        >
                          <td>
                            <div className="ops-desk-entity">
                              <span className="ops-desk-entity-name">{p.name}</span>
                              <span className="ops-desk-entity-meta">
                                <span className="ops-mono">{p.key}</span>
                                {p.description ? <span>{p.description}</span> : null}
                              </span>
                            </div>
                          </td>
                          <td>
                            <ToolPills ids={p.toolIds} />
                          </td>
                          <td>
                            <StatusBadge
                              status={customRow ? "ready" : "live"}
                              label={customRow ? "Custom" : "Platform"}
                            />
                          </td>
                          <td>
                            {customRow ? (
                              <div className="ops-row-actions">
                                <Button
                                  type="button"
                                  variant="ghost"
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
                            ) : (
                              <span className="ops-faint">Locked</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
