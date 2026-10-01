import { useState } from "react";
import { Button, Field, Input } from "@call-agent/ui";
import { useUserAsync } from "../../hooks/useAsync";
import {
  Feedback,
  LoadState,
  Panel,
  RecordForm,
  dateLabel,
  isoDate,
  label,
  localDate,
  obj,
  rows,
  str,
  useCrmApi,
  type CrmApi,
  type Row,
} from "./CrmUi";

export default function CrmContacts({
  connectionId,
}: {
  connectionId: string;
}) {
  const { api, busy, error, notice, mutate } = useCrmApi(connectionId);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [editor, setEditor] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const state = useUserAsync(
    () => api("contacts.list", { query: search, cursor, limit: 50 }),
    [search, cursor],
  );
  const edit = (row: Row) =>
    void mutate(async () => {
      const found = await api("contacts.get", { id: row.id });
      setSelected(null);
      setEditor(obj(found.contact));
    }, "Contact loaded.");
  return (
    <div className="crm-stack">
      <Feedback error={error} notice={notice} />
      <Panel
        title="Contacts"
        actions={
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setEditor({});
              setSelected(null);
            }}
          >
            New contact
          </Button>
        }
      >
        <form
          className="crm-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
            setCursor(undefined);
            setSelected(null);
            setEditor(null);
          }}
        >
          <Input
            aria-label="Search CRM contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or phone"
            maxLength={120}
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Button type="button" variant="ghost" onClick={state.reload}>
            Refresh
          </Button>
        </form>
        <LoadState state={state}>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Tags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows(state.data?.contacts).map((contact) => (
                  <tr key={str(contact.id)}>
                    <td>
                      <strong>{label(contact)}</strong>
                      <div className="ops-desk-note">
                        {str(contact.companyName)}
                        {contact.dnd === true ? " · DND" : ""}
                      </div>
                    </td>
                    <td>{str(contact.email) || "—"}</td>
                    <td>{str(contact.phone) || "—"}</td>
                    <td>
                      {Array.isArray(contact.tags)
                        ? contact.tags.map(str).join(", ")
                        : "—"}
                    </td>
                    <td>
                      <div className="ops-row-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            setSelected(contact);
                            setEditor(null);
                          }}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => edit(contact)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="dangerGhost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete ${label(contact)} from HighLevel? This removes the CRM contact and associated data.`,
                              )
                            )
                              void mutate(async () => {
                                await api("contacts.delete", {
                                  id: contact.id,
                                });
                                setSelected(null);
                                setEditor(null);
                                state.reload();
                              }, "Contact deleted from HighLevel.");
                          }}
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
          {!rows(state.data?.contacts).length && (
            <p className="ops-desk-note">No contacts match this search.</p>
          )}
          <div className="crm-pagination">
            <span>
              {str(obj(state.data?.meta).total)
                ? `${str(obj(state.data?.meta).total)} contacts`
                : `${rows(state.data?.contacts).length} shown`}
            </span>
            {cursor && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setCursor(undefined)}
              >
                First page
              </Button>
            )}
            {Boolean(state.data?.nextCursor) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCursor(str(state.data?.nextCursor));
                  setSelected(null);
                }}
              >
                Next page
              </Button>
            )}
          </div>
        </LoadState>
      </Panel>
      {editor && (
        <ContactEditor
          key={str(editor.id) || "new"}
          api={api}
          row={editor}
          busy={busy}
          cancel={() => setEditor(null)}
          save={(data) =>
            void mutate(async () => {
              await api(editor.id ? "contacts.update" : "contacts.create", {
                ...(editor.id ? { id: editor.id } : {}),
                data,
              });
              setEditor(null);
              state.reload();
            })
          }
        />
      )}
      {selected && (
        <ContactDetail
          key={str(selected.id)}
          connectionId={connectionId}
          contactId={str(selected.id)}
        />
      )}
    </div>
  );
}

function ContactEditor({
  api,
  row,
  busy,
  save,
  cancel,
}: {
  api: CrmApi;
  row: Row;
  busy: boolean;
  save: (data: Row) => void;
  cancel: () => void;
}) {
  const fields = useUserAsync(() => api("fields.list"), []);
  const current = rows(row.customFields);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const definitions = rows(fields.data?.customFields).filter(
    (f) => !f.model || f.model === "contact",
  );
  return (
    <RecordForm
      title={row.id ? `Edit ${label(row)}` : "New contact"}
      busy={busy}
      onCancel={cancel}
      initial={{
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(str).join(", ") : "",
      }}
      fields={[
        { key: "firstName", label: "First name" },
        { key: "lastName", label: "Last name" },
        { key: "email", label: "Email", type: "email" },
        { key: "phone", label: "Phone" },
        { key: "companyName", label: "Company" },
        { key: "address1", label: "Address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "postalCode", label: "Postal code" },
        { key: "tags", label: "Tags", hint: "Separate tags with commas." },
        { key: "dnd", label: "Do Not Disturb", type: "checkbox" },
      ]}
      onSubmit={(values) => {
        const data = Object.fromEntries(
          [
            "firstName",
            "lastName",
            "email",
            "phone",
            "companyName",
            "address1",
            "city",
            "state",
            "postalCode",
          ].map((key) => [key, str(values[key])]),
        );
        save({
          ...data,
          dnd: values.dnd === true,
          tags: str(values.tags)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          ...(Object.keys(custom).length
            ? {
                customFields: Object.entries(custom).map(
                  ([id, fieldValue]) => ({ id, fieldValue }),
                ),
              }
            : {}),
        });
      }}
    >
      <details>
        <summary>Custom fields</summary>
        {fields.loading ? (
          <p>Loading custom fields…</p>
        ) : fields.error ? (
          <p className="ops-desk-note">
            {fields.error} Core contact fields are still editable.
          </p>
        ) : (
          <div className="crm-form-grid">
            {definitions.map((field) => {
              const id = str(field.id);
              const existing = current.find((c) => c.id === id);
              const value = existing?.value ?? existing?.fieldValue;
              const type = str(field.dataType);
              if (
                [
                  "FILE_UPLOAD",
                  "MULTIPLE_OPTIONS",
                  "CHECKBOX",
                  "RADIO",
                  "SINGLE_OPTIONS",
                  "DATE",
                  "NUMERICAL",
                  "MONETORY",
                ].includes(type)
              )
                return (
                  <div key={id}>
                    <strong>{label(field)}</strong>
                    <p className="ops-desk-note">
                      {Array.isArray(value)
                        ? value.map(str).join(", ")
                        : str(value) || "—"}{" "}
                      · {type.toLowerCase().replaceAll("_", " ")} field
                    </p>
                  </div>
                );
              return (
                <Field key={id} label={label(field)} htmlFor={`custom-${id}`}>
                  <Input
                    id={`custom-${id}`}
                    disabled={busy}
                    value={custom[id] ?? str(value)}
                    maxLength={5000}
                    onChange={(e) =>
                      setCustom((v) => ({ ...v, [id]: e.target.value }))
                    }
                  />
                </Field>
              );
            })}
          </div>
        )}
      </details>
    </RecordForm>
  );
}

function ContactDetail({
  connectionId,
  contactId,
}: {
  connectionId: string;
  contactId: string;
}) {
  const { api, busy, error, notice, mutate } = useCrmApi(connectionId);
  const [tab, setTab] = useState<"notes" | "tasks">("notes");
  const [editor, setEditor] = useState<Row | null>(null);
  const state = useUserAsync(() => api(`${tab}.list`, { contactId }), [tab]);
  const records = rows(state.data?.[tab]);
  return (
    <Panel
      title="Contact activity"
      actions={
        <Button
          size="sm"
          onClick={() => setEditor({ completed: false })}
          disabled={busy}
        >
          Add {tab === "notes" ? "note" : "task"}
        </Button>
      }
    >
      <Feedback error={error} notice={notice} />
      <div className="ops-mode-toggle">
        {(["notes", "tasks"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`ops-mode-btn${tab === t ? " is-active" : ""}`}
            onClick={() => {
              setTab(t);
              setEditor(null);
            }}
          >
            {t === "notes" ? "Notes" : "Tasks"}
          </button>
        ))}
      </div>
      <LoadState state={state}>
        {!records.length && (
          <p className="ops-desk-note">No {tab} for this contact.</p>
        )}
        {records.map((record) => (
          <article key={str(record.id)} className="crm-activity">
            <strong>{str(record.title) || "Note"}</strong>
            <p className="crm-text">{str(record.body)}</p>
            <small>
              {tab === "tasks"
                ? `${record.completed ? "Completed" : "Due"} · ${dateLabel(record.dueDate)}`
                : dateLabel(record.dateAdded)}
            </small>
            <div className="ops-row-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  setEditor({ ...record, dueDate: localDate(record.dueDate) })
                }
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="dangerGhost"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete this ${tab === "notes" ? "note" : "task"} from HighLevel?`,
                    )
                  )
                    void mutate(async () => {
                      await api(`${tab}.delete`, { contactId, id: record.id });
                      state.reload();
                    }, "Deleted from HighLevel.");
                }}
              >
                Delete
              </Button>
            </div>
          </article>
        ))}
      </LoadState>
      {editor && (
        <RecordForm
          key={`${tab}-${str(editor.id)}`}
          title={`${editor.id ? "Edit" : "Add"} ${tab === "notes" ? "note" : "task"}`}
          initial={editor}
          busy={busy}
          onCancel={() => setEditor(null)}
          fields={
            tab === "notes"
              ? [
                  {
                    key: "body",
                    label: "Note",
                    type: "textarea",
                    required: true,
                  },
                ]
              : [
                  { key: "title", label: "Task title", required: true },
                  { key: "body", label: "Description", type: "textarea" },
                  {
                    key: "dueDate",
                    label: "Due time",
                    type: "datetime-local",
                    required: true,
                  },
                  { key: "completed", label: "Completed", type: "checkbox" },
                ]
          }
          onSubmit={(values) =>
            void mutate(async () => {
              const data =
                tab === "notes"
                  ? { body: str(values.body) }
                  : {
                      title: str(values.title),
                      body: str(values.body),
                      dueDate: isoDate(values.dueDate),
                      completed: values.completed === true,
                    };
              await api(`${tab}.${editor.id ? "update" : "create"}`, {
                contactId,
                ...(editor.id ? { id: editor.id } : {}),
                data,
              });
              setEditor(null);
              state.reload();
            })
          }
        />
      )}
    </Panel>
  );
}
