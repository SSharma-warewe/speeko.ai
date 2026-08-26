import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button } from "@call-agent/ui";
import {
  ApiError,
  getOrgAssignedTools,
  listAdminKnownTools,
  TOOL_ID_HINTS,
  UnauthorizedError,
  updateOrgAssignedTools,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { useAsync } from "../hooks/useAsync";

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
  {
    label: "GHL",
    ids: [
      "checkGhlFreeSlots",
      "lookupGhlContact",
      "upsertGhlContact",
      "scheduleGhlMeeting",
    ],
  },
];

function groupCatalog(catalog: string[]): { label: string; ids: string[] }[] {
  const remaining = new Set(catalog);
  const groups: { label: string; ids: string[] }[] = [];
  for (const group of TOOL_GROUPS) {
    const ids = group.ids.filter((id) => remaining.has(id));
    for (const id of ids) remaining.delete(id);
    if (ids.length > 0) groups.push({ label: group.label, ids });
  }
  const leftover = catalog.filter((id) => remaining.has(id));
  if (leftover.length > 0) groups.push({ label: "Other", ids: leftover });
  return groups;
}

export default function OrgToolsPage() {
  const { orgId = "" } = useParams();
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [assigned, known] = await Promise.all([
      getOrgAssignedTools(orgId),
      listAdminKnownTools(),
    ]);
    return {
      assigned: assigned.toolIds,
      catalog: known.toolIds,
    };
  }, [orgId]);

  const [selected, setSelected] = useState<string[]>(["endCall"]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSelected([...new Set(["endCall", ...data.assigned])]);
  }, [data]);

  const toggle = (toolId: string) => {
    if (toolId === "endCall") return;
    setSelected((prev) =>
      prev.includes(toolId)
        ? prev.filter((t) => t !== toolId)
        : [...prev, toolId],
    );
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const result = await updateOrgAssignedTools(orgId, {
        toolIds: [...new Set(["endCall", ...selected])],
      });
      setSelected([...new Set(["endCall", ...result.toolIds])]);
      setSaved(true);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(
        err instanceof ApiError ? err.message : "Could not save assigned tools.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading org tools" />;
  if (error || !data) {
    return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;
  }

  const groups = groupCatalog(data.catalog);
  const extraCount = selected.filter((id) => id !== "endCall").length;

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>Assigned tools</h2>
      </div>
      <form className="ops-panel-body ops-form" onSubmit={handleSave}>
        <p className="ops-faint" style={{ marginTop: 0 }}>
          Org users can only put these worker tools on profiles. Hangup is
          always included. Runtime capabilities are this allowlist intersected
          with the agent&apos;s profile.
        </p>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {saved ? <Alert tone="info">Tools updated.</Alert> : null}

        <div className="ops-tool-groups" role="group" aria-label="Assigned tools">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="ops-tool-group-label">{group.label}</p>
              <div className="ops-tool-grid">
                {group.ids.map((toolId) => {
                  const locked = toolId === "endCall";
                  const checked = locked || selected.includes(toolId);
                  return (
                    <label
                      key={toolId}
                      className={`ops-tool-chip${checked ? " is-on" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={submitting || locked}
                        onChange={() => toggle(toolId)}
                      />
                      <span className="ops-tool-chip-copy">
                        <span className="ops-tool-chip-id">{toolId}</span>
                        <span className="ops-tool-chip-hint">
                          {TOOL_ID_HINTS[toolId] || "Worker tool"}
                          {locked ? " (required)" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="ops-form-actions">
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={submitting}
          >
            Save tools
          </Button>
          <span className="ops-faint">
            {extraCount} extra · endCall locked
          </span>
        </div>
      </form>
    </section>
  );
}
