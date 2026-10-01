import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { Alert, Button, Field, Input, Select } from "@call-agent/ui";
import { WHATSAPP_CONTACT_FIELDS } from "@call-agent/contracts";
import {
  ApiError,
  listUserGhlContacts,
  listUserWhatsAppTemplates,
  sendUserWhatsAppTemplate,
  UnauthorizedError,
  type GhlContactRow,
  type OrganizationIntegration,
  type SendWhatsAppRecipient,
  type SendWhatsAppTemplateResponse,
  type WhatsAppTemplate,
  type WhatsAppVariableSource,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";

const MAX_RECIPIENTS = 50;

type ContactField = (typeof WHATSAPP_CONTACT_FIELDS)[number];
type SourceMode = ContactField | "text";
type SourceState = { mode: SourceMode; text: string };

const FIELD_LABEL: Record<ContactField, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  phone: "Phone",
  email: "Email",
  company: "Company",
};

function contactFieldValue(
  contact: GhlContactRow,
  field: ContactField,
): string {
  switch (field) {
    case "firstName":
      return contact.firstName || contact.name.split(/\s+/)[0] || "";
    case "lastName":
      return contact.lastName;
    case "fullName":
      return (
        contact.name ||
        [contact.firstName, contact.lastName].filter(Boolean).join(" ")
      );
    case "phone":
      return contact.phone ?? "";
    case "email":
      return contact.email ?? "";
    case "company":
      return contact.company ?? "";
  }
}

function toSource(state: SourceState): WhatsAppVariableSource {
  return state.mode === "text"
    ? { type: "text", text: state.text.trim() }
    : { type: "field", field: state.mode };
}

function defaultSources(
  template: WhatsAppTemplate,
): Record<string, SourceState> {
  const out: Record<string, SourceState> = {};
  template.bodyVariables.forEach((variable, index) => {
    out[variable.key] =
      index === 0
        ? { mode: "firstName", text: "" }
        : { mode: "text", text: "" };
  });
  return out;
}

function templateKey(t: WhatsAppTemplate): string {
  return `${t.name}::${t.language}`;
}

function SourcePicker({
  id,
  label,
  state,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  state: SourceState;
  disabled: boolean;
  onChange: (next: SourceState) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="ops-wa-source">
        <Select
          id={id}
          value={state.mode}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...state, mode: e.target.value as SourceMode })
          }
        >
          {WHATSAPP_CONTACT_FIELDS.map((field) => (
            <option key={field} value={field}>
              {FIELD_LABEL[field]}
            </option>
          ))}
          <option value="text">Custom text</option>
        </Select>
        {state.mode === "text" ? (
          <Input
            aria-label={`${label} custom text`}
            value={state.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...state, text: e.target.value })}
            placeholder="Same text for everyone"
          />
        ) : null}
      </div>
    </Field>
  );
}

type Props = {
  contactSources: OrganizationIntegration[];
  hasWhatsApp: boolean;
  hasContacts: boolean;
  onGoConnections: () => void;
  onSent: () => void;
};

export default function WhatsAppSendTab({
  contactSources,
  hasWhatsApp,
  hasContacts,
  onGoConnections,
  onSent,
}: Props) {
  const { logout } = useUserAuth();
  const [contactSourceId, setContactSourceId] = useState(
    contactSources.find((c) => c.provider === "ghl_contacts")?.id ??
      contactSources[0]?.id ??
      "",
  );
  const contactRequest = useRef(0);

  /* ── templates ── */
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [bodySources, setBodySources] = useState<Record<string, SourceState>>(
    {},
  );
  const [urlSource, setUrlSource] = useState<SourceState>({
    mode: "text",
    text: "",
  });

  /* ── contacts ── */
  const [contacts, setContacts] = useState<GhlContactRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, GhlContactRow>>({});

  /* ── send ── */
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSend, setLastSend] = useState<SendWhatsAppTemplateResponse | null>(
    null,
  );

  const handleError = useCallback(
    (err: unknown, fallback: string): string | null => {
      if (err instanceof UnauthorizedError) {
        logout();
        return null;
      }
      return err instanceof ApiError ? err.message : fallback;
    },
    [logout],
  );

  useEffect(() => {
    if (!hasWhatsApp) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    listUserWhatsAppTemplates()
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.templates);
        setSelectedKey((current) => {
          if (
            current &&
            res.templates.some((t) => templateKey(t) === current)
          ) {
            return current;
          }
          const first = res.templates.find((t) => t.sendable);
          return first ? templateKey(first) : "";
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = handleError(err, "Could not load templates from Meta.");
        if (message) setTemplatesError(message);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasWhatsApp, handleError]);

  const template = useMemo(
    () => templates.find((t) => templateKey(t) === selectedKey) ?? null,
    [templates, selectedKey],
  );
  const sendable = useMemo(
    () => templates.filter((t) => t.sendable),
    [templates],
  );
  const unsendableCount = templates.length - sendable.length;

  useEffect(() => {
    if (!template) return;
    setBodySources(defaultSources(template));
    setUrlSource({ mode: "text", text: "" });
    setSendError(null);
  }, [template]);

  const loadContacts = useCallback(
    async (query: string, cursor?: string) => {
      const requestId = ++contactRequest.current;
      setContactsLoading(true);
      setContactsError(null);
      try {
        const res = await listUserGhlContacts({
          query,
          cursor,
          integrationId: contactSourceId || undefined,
        });
        if (requestId !== contactRequest.current) return;
        setContacts((prev) =>
          cursor ? [...prev, ...res.contacts] : res.contacts,
        );
        setNextCursor(res.nextCursor);
        setTotal(res.total);
        setActiveQuery(query);
      } catch (err) {
        if (requestId !== contactRequest.current) return;
        const message = handleError(
          err,
          "Could not load GoHighLevel contacts.",
        );
        if (message) setContactsError(message);
      } finally {
        if (requestId === contactRequest.current) setContactsLoading(false);
      }
    },
    [handleError, contactSourceId],
  );

  useEffect(() => {
    setSelected({});
    if (!hasContacts) {
      setContacts([]);
      setNextCursor(null);
      return;
    }
    void loadContacts("");
    return () => {
      contactRequest.current++;
    };
  }, [hasContacts, loadContacts]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;
  const atLimit = selectedCount >= MAX_RECIPIENTS;

  const isSelectable = (c: GhlContactRow) => Boolean(c.phone) && !c.dnd;
  const selectableOnPage = contacts.filter(isSelectable);
  const allOnPageSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every((c) => selected[c.id]);

  const toggleContact = (contact: GhlContactRow) => {
    setSelected((prev) => {
      if (prev[contact.id]) {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      }
      if (Object.keys(prev).length >= MAX_RECIPIENTS) return prev;
      return { ...prev, [contact.id]: contact };
    });
  };

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (allOnPageSelected) {
        for (const c of selectableOnPage) delete next[c.id];
        return next;
      }
      for (const c of selectableOnPage) {
        if (Object.keys(next).length >= MAX_RECIPIENTS) break;
        next[c.id] = c;
      }
      return next;
    });
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void loadContacts(searchInput.trim());
  };

  const previewContact = selectedList[0] ?? null;
  const preview = useMemo(() => {
    if (!template) return "";
    return template.bodyText.replace(
      /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
      (whole, key: string) => {
        const variable = template.bodyVariables.find((v) => v.key === key);
        if (!variable) return whole;
        const state = bodySources[key];
        if (!state) return whole;
        if (state.mode === "text") return state.text.trim() || whole;
        if (previewContact) {
          return contactFieldValue(previewContact, state.mode) || whole;
        }
        return variable.example ?? whole;
      },
    );
  }, [template, bodySources, previewContact]);

  const handleSend = async () => {
    if (!template) return;
    setSendError(null);
    if (selectedCount === 0) {
      setSendError("Select at least one contact.");
      return;
    }
    for (const variable of template.bodyVariables) {
      const state = bodySources[variable.key];
      if (state?.mode === "text" && !state.text.trim()) {
        setSendError(
          `Enter text for {{${variable.key}}} or pick a contact field.`,
        );
        return;
      }
    }
    if (
      template.urlButtonVariable &&
      urlSource.mode === "text" &&
      !urlSource.text.trim()
    ) {
      setSendError(
        "Enter text for the URL button variable or pick a contact field.",
      );
      return;
    }
    if (
      !window.confirm(
        `Send “${template.name}” to ${selectedCount} contact${selectedCount === 1 ? "" : "s"}? Only message contacts who agreed to hear from you on WhatsApp.`,
      )
    ) {
      return;
    }

    const recipients: SendWhatsAppRecipient[] = selectedList.map((c) => ({
      ghlContactId: c.id,
      name: c.name || undefined,
      firstName: c.firstName || undefined,
      lastName: c.lastName || undefined,
      phone: c.phone ?? "",
      ...(c.email ? { email: c.email } : {}),
      ...(c.company ? { company: c.company } : {}),
      dnd: c.dnd,
    }));

    setSending(true);
    try {
      const result = await sendUserWhatsAppTemplate({
        templateName: template.name,
        language: template.language,
        ...(template.bodyVariables.length > 0
          ? {
              bodyVariables: Object.fromEntries(
                template.bodyVariables.map((v) => [
                  v.key,
                  toSource(bodySources[v.key] ?? { mode: "text", text: "" }),
                ]),
              ),
            }
          : {}),
        ...(template.urlButtonVariable
          ? { urlButtonVariable: toSource(urlSource) }
          : {}),
        recipients,
      });
      setLastSend(result);
      // Keep only the contacts that did not go out so a retry is easy.
      const delivered = new Set(
        result.results
          .filter((r) => r.status === "sent" && r.ghlContactId)
          .map((r) => r.ghlContactId as string),
      );
      setSelected((prev) => {
        const next = { ...prev };
        for (const id of delivered) delete next[id];
        return next;
      });
      onSent();
    } catch (err) {
      const message = handleError(err, "Could not send the template.");
      if (message) setSendError(message);
    } finally {
      setSending(false);
    }
  };

  const problems = lastSend?.results.filter((r) => r.status !== "sent") ?? [];

  return (
    <>
      <section className="ops-panel ops-desk-compose">
        <div className="ops-panel-head">
          <span className="ops-desk-kicker">Template message</span>
          <span className="ops-desk-hint">From your WhatsApp line</span>
        </div>
        <div className="ops-panel-body ops-form ops-desk-form">
          {!hasWhatsApp ? (
            <EmptyState
              title="Connect WhatsApp first"
              description="Add your Meta access token, phone number ID and WABA ID to load approved templates."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onGoConnections}
                >
                  Open connections
                </Button>
              }
            />
          ) : templatesLoading && templates.length === 0 ? (
            <LoadingBlock label="Loading templates from Meta" />
          ) : templatesError ? (
            <Alert tone="error">{templatesError}</Alert>
          ) : sendable.length === 0 ? (
            <EmptyState
              title="No sendable templates"
              description="Approve a text template in Meta WhatsApp Manager. Media-header and authentication templates are not supported yet."
            />
          ) : (
            <>
              {sendError ? <Alert tone="error">{sendError}</Alert> : null}

              <Field
                label="Template"
                htmlFor="wa-template"
                hint={
                  unsendableCount > 0
                    ? `${unsendableCount} template(s) hidden (not approved or unsupported).`
                    : "Approved templates from your WhatsApp Business Account."
                }
              >
                <Select
                  id="wa-template"
                  value={selectedKey}
                  disabled={sending}
                  onChange={(e) => setSelectedKey(e.target.value)}
                >
                  {sendable.map((t) => (
                    <option key={templateKey(t)} value={templateKey(t)}>
                      {t.name} · {t.language} · {t.category.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>

              {template ? (
                <>
                  {template.bodyVariables.map((variable) => (
                    <SourcePicker
                      key={variable.key}
                      id={`wa-var-${variable.key}`}
                      label={`{{${variable.key}}}${variable.example ? ` · e.g. ${variable.example}` : ""}`}
                      state={
                        bodySources[variable.key] ?? { mode: "text", text: "" }
                      }
                      disabled={sending}
                      onChange={(next) =>
                        setBodySources((prev) => ({
                          ...prev,
                          [variable.key]: next,
                        }))
                      }
                    />
                  ))}
                  {template.urlButtonVariable ? (
                    <SourcePicker
                      id="wa-url-var"
                      label="URL button variable"
                      state={urlSource}
                      disabled={sending}
                      onChange={setUrlSource}
                    />
                  ) : null}

                  <div className="ops-wa-preview" aria-live="polite">
                    <span className="ops-desk-kicker">
                      Preview
                      {previewContact
                        ? ` · ${previewContact.name || "first selected"}`
                        : ""}
                    </span>
                    <p>{preview}</p>
                  </div>

                  <div className="ops-desk-submit">
                    <Button
                      type="button"
                      variant="primary"
                      loading={sending}
                      disabled={sending || selectedCount === 0}
                      onClick={() => void handleSend()}
                    >
                      {selectedCount > 0
                        ? `Send to ${selectedCount} contact${selectedCount === 1 ? "" : "s"}`
                        : "Select contacts to send"}
                    </Button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="ops-panel ops-desk-list">
        <div className="ops-desk-list-bar">
          <div className="ops-desk-list-bar-main">
            <span className="ops-desk-kicker">GoHighLevel contacts</span>
            <span className="ops-desk-hint">
              {selectedCount} selected
              {atLimit ? ` (max ${MAX_RECIPIENTS})` : ""}
              {total !== null ? ` · ${total} in CRM` : ""}
            </span>
          </div>
          {hasContacts ? (
            <form className="ops-wa-search" onSubmit={handleSearch}>
              <Select
                aria-label="CRM contact source"
                value={contactSourceId}
                disabled={sending}
                onChange={(e) => {
                  contactRequest.current++;
                  setContacts([]);
                  setSelected({});
                  setNextCursor(null);
                  setTotal(null);
                  setSearchInput("");
                  setActiveQuery("");
                  setContactsLoading(true);
                  setContactSourceId(e.target.value);
                }}
              >
                {contactSources.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Search contacts"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, phone"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={contactsLoading}
              >
                Search
              </Button>
              {selectedCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected({})}
                >
                  Clear
                </Button>
              ) : null}
            </form>
          ) : null}
        </div>
        <div className="ops-panel-body is-flush ops-desk-list-body">
          {lastSend ? (
            <div className="ops-wa-result">
              <Alert tone={lastSend.failed > 0 ? "warn" : "info"}>
                Sent {lastSend.sent}, failed {lastSend.failed}, skipped{" "}
                {lastSend.skipped}.{" "}
                <button
                  type="button"
                  className="ops-wa-link"
                  onClick={() => setLastSend(null)}
                >
                  Dismiss
                </button>
              </Alert>
              {problems.length > 0 ? (
                <ul className="ops-wa-problems">
                  {problems.map((r, i) => (
                    <li key={`${r.phone}-${i}`}>
                      <StatusBadge
                        status={r.status === "failed" ? "failed" : "warn"}
                        label={r.status}
                      />
                      <span>{r.name || r.phone}</span>
                      <span className="ops-faint">{r.error}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {!hasContacts ? (
            <EmptyState
              title="Connect GoHighLevel to import contacts"
              description="Add a Private Integration Token with contacts.readonly and your location ID."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onGoConnections}
                >
                  Open connections
                </Button>
              }
            />
          ) : contactsError ? (
            <div className="ops-wa-result">
              <Alert tone="error">{contactsError}</Alert>
            </div>
          ) : contactsLoading && contacts.length === 0 ? (
            <LoadingBlock label="Loading contacts" />
          ) : contacts.length === 0 ? (
            <EmptyState
              title={activeQuery ? "No matching contacts" : "No contacts"}
              description={
                activeQuery
                  ? "Try a different name, email, or phone."
                  : "This GoHighLevel location has no contacts yet."
              }
            />
          ) : (
            <>
              <div className="ops-table-wrap">
                <table className="ops-table ops-desk-table">
                  <thead>
                    <tr>
                      <th className="ops-check-col">
                        <input
                          type="checkbox"
                          aria-label="Select all contacts on this page"
                          checked={allOnPageSelected}
                          disabled={selectableOnPage.length === 0}
                          onChange={toggleAllOnPage}
                        />
                      </th>
                      <th>Contact</th>
                      <th>Phone</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => {
                      const on = Boolean(selected[c.id]);
                      const selectable = isSelectable(c);
                      return (
                        <tr key={c.id} className={on ? "is-live" : undefined}>
                          <td className="ops-check-col">
                            <input
                              type="checkbox"
                              aria-label={`Select ${c.name || c.phone || c.id}`}
                              checked={on}
                              disabled={!selectable || (!on && atLimit)}
                              onChange={() => toggleContact(c)}
                            />
                          </td>
                          <td>
                            <div className="ops-desk-entity">
                              <span className="ops-desk-entity-name">
                                {c.name || "Unnamed contact"}
                              </span>
                              <span className="ops-desk-entity-meta">
                                {c.email || c.company || "—"}
                              </span>
                            </div>
                          </td>
                          <td className="ops-mono">{c.phone ?? "—"}</td>
                          <td>
                            {c.dnd ? (
                              <StatusBadge status="failed" label="DND" />
                            ) : !c.phone ? (
                              <StatusBadge status="inactive" label="No phone" />
                            ) : (
                              <StatusBadge status="active" label="OK" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {nextCursor ? (
                <div className="ops-wa-more">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={contactsLoading}
                    disabled={contactsLoading}
                    onClick={() => void loadContacts(activeQuery, nextCursor)}
                  >
                    Load more
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}
