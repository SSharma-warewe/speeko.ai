import { useState } from "react";
import { Button, Field, Input } from "@call-agent/ui";
import { useUserAsync } from "../../hooks/useAsync";
import {
  ContactPicker,
  Feedback,
  LoadState,
  Panel,
  label,
  rows,
  str,
  useCrmApi,
} from "./CrmUi";

export default function CrmWorkflows({
  connectionId,
}: {
  connectionId: string;
}) {
  const { api, busy, error, notice, mutate } = useCrmApi(connectionId);
  const [contactId, setContactId] = useState("");
  const [query, setQuery] = useState("");
  const workflows = useUserAsync(() => api("workflows.list"), []);
  const records = rows(workflows.data?.workflows).filter((w) =>
    label(w).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Panel
      title="Workflows"
      actions={
        <Button size="sm" variant="ghost" onClick={workflows.reload}>
          Refresh
        </Button>
      }
    >
      <Feedback error={error} notice={notice} />
      <p className="ops-desk-note">
        Run your existing HighLevel automations for a contact. Enrollment can
        send messages or perform other actions configured in the workflow.
      </p>
      <div className="crm-workflow-controls">
        <Field label="Contact">
          <ContactPicker
            api={api}
            value={contactId}
            onChange={setContactId}
            disabled={busy}
          />
        </Field>
        <Field label="Find a workflow" htmlFor="crm-workflow-filter">
          <Input
            id="crm-workflow-filter"
            aria-label="Filter workflows"
            placeholder="Filter workflows"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
      </div>
      <LoadState state={workflows}>
        {!records.length && <p>No workflows found.</p>}
        {records.map((workflow) => (
          <article className="crm-activity" key={str(workflow.id)}>
            <strong>{label(workflow)}</strong>
            <p className="ops-desk-note">{str(workflow.status)}</p>
            <div className="ops-row-actions">
              <Button
                size="sm"
                disabled={
                  busy ||
                  !contactId ||
                  (!!workflow.status &&
                    !["published", "active"].includes(
                      str(workflow.status).toLowerCase(),
                    ))
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `Enroll the selected contact into “${label(workflow)}”? Its automations will run.`,
                    )
                  )
                    void mutate(async () => {
                      await api("workflows.enroll", {
                        contactId,
                        id: workflow.id,
                      });
                    }, "Contact enrolled in the workflow.");
                }}
              >
                Enroll contact
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !contactId}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove the selected contact from “${label(workflow)}”?`,
                    )
                  )
                    void mutate(async () => {
                      await api("workflows.remove", {
                        contactId,
                        id: workflow.id,
                      });
                    }, "Contact removed from workflow.");
                }}
              >
                Remove contact
              </Button>
            </div>
          </article>
        ))}
      </LoadState>
    </Panel>
  );
}

export function CrmReference({ connectionId }: { connectionId: string }) {
  const { api } = useCrmApi(connectionId);
  const [tab, setTab] = useState<"tags" | "fields" | "users">("tags");
  const state = useUserAsync(() => api(`${tab}.list`), [tab]);
  const records = rows(state.data?.[tab === "fields" ? "customFields" : tab]);
  return (
    <Panel title="CRM directory">
      <div className="ops-mode-toggle">
        {(["tags", "fields", "users"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`ops-mode-btn${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "fields" ? "Custom fields" : t === "users" ? "Team" : "Tags"}
          </button>
        ))}
      </div>
      <p className="ops-desk-note">
        Reference data from your HighLevel location. Edit contact tags and text
        custom field values on the Contacts page.
      </p>
      <LoadState state={state}>
        {!records.length && <p>No records found.</p>}
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>
                  {tab === "fields"
                    ? "Type / model"
                    : tab === "users"
                      ? "Email"
                      : "ID"}
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={str(record.id)}>
                  <td>{label(record)}</td>
                  <td>
                    {tab === "fields"
                      ? `${str(record.dataType)} / ${str(record.model) || "contact"}`
                      : tab === "users"
                        ? str(record.email)
                        : str(record.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LoadState>
    </Panel>
  );
}
