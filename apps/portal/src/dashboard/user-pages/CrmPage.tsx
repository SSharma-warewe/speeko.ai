import { Link, useSearchParams } from "react-router-dom";
import { Field, Select } from "@call-agent/ui";
import { listUserOrgIntegrations } from "../../lib/api";
import { useUserAsync } from "../hooks/useAsync";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import CrmContacts from "./crm/CrmContacts";
import CrmCalendar from "./crm/CrmCalendar";
import CrmOpportunities from "./crm/CrmOpportunities";
import CrmConversations from "./crm/CrmConversations";
import CrmWorkflows, { CrmReference } from "./crm/CrmWorkflows";
import "./crm/Crm.css";

const TABS = [
  { id: "contacts", label: "Contacts" },
  { id: "calendar", label: "Calendar" },
  { id: "opportunities", label: "Opportunities" },
  { id: "conversations", label: "Conversations" },
  { id: "workflows", label: "Workflows" },
  { id: "directory", label: "Directory" },
] as const;
export default function CrmPage() {
  const [params, setParams] = useSearchParams();
  const state = useUserAsync(listUserOrgIntegrations, []);
  const tab = TABS.some((t) => t.id === params.get("tab"))
    ? params.get("tab")!
    : "contacts";
  if (state.loading) return <LoadingBlock label="Loading CRM connections" />;
  if (state.error || !state.data)
    return (
      <ErrorBlock
        message={state.error ?? "Could not load CRM connections"}
        onRetry={state.reload}
      />
    );
  const connections = state.data.filter(
    (c) => c.provider === "ghl_crm" && c.isActive,
  );
  const connection =
    connections.find((c) => c.id === params.get("connection")) ??
    connections[0];
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  };
  return (
    <div className="crm-workspace">
      <header className="crm-workspace-header">
        <div className="crm-workspace-title">
          <span className="crm-eyebrow">Customer workspace</span>
          <h1>CRM</h1>
          <p>Contacts, appointments, and conversations. All in one place.</p>
        </div>
        <div className="crm-connection-switcher">
          {connection && (
            <Field label="HighLevel connection" htmlFor="crm-connection">
              <Select
                id="crm-connection"
                value={connection.id}
                onChange={(e) => change("connection", e.target.value)}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="crm-connection-meta">
            {connection && (
              <span className="crm-live-status">
                <span aria-hidden />
                Live connection
              </span>
            )}
            <Link to="/dashboard/integrations?tab=crm">
              Manage connection →
            </Link>
          </div>
        </div>
      </header>
      {!connection ? (
        <section className="ops-panel crm-empty">
          <div className="ops-panel-body">
            <h2>Connect your HighLevel CRM</h2>
            <p>
              Add your private integration token and location ID in Integrations
              → CRM. Your existing contacts, calendars, deals, and conversations
              will appear here.
            </p>
            <Link to="/dashboard/integrations?tab=crm">
              Add CRM connection →
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="crm-tabs" role="tablist" aria-label="CRM pages">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`crm-tab-${t.id}`}
                aria-controls="crm-page-content"
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                className={`crm-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => change("tab", t.id)}
                onKeyDown={(e) => {
                  const index = TABS.findIndex((item) => item.id === t.id);
                  const next =
                    e.key === "ArrowRight"
                      ? (index + 1) % TABS.length
                      : e.key === "ArrowLeft"
                        ? (index + TABS.length - 1) % TABS.length
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? TABS.length - 1
                            : null;
                  if (next === null) return;
                  e.preventDefault();
                  change("tab", TABS[next].id);
                  document.getElementById(`crm-tab-${TABS[next].id}`)?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            key={`${connection.id}-${tab}`}
            id="crm-page-content"
            className="crm-page-content"
            role="tabpanel"
            aria-labelledby={`crm-tab-${tab}`}
            tabIndex={0}
          >
            {tab === "contacts" && <CrmContacts connectionId={connection.id} />}
            {tab === "calendar" && <CrmCalendar connectionId={connection.id} />}
            {tab === "opportunities" && (
              <CrmOpportunities connectionId={connection.id} />
            )}
            {tab === "conversations" && (
              <CrmConversations connectionId={connection.id} />
            )}
            {tab === "workflows" && (
              <CrmWorkflows connectionId={connection.id} />
            )}
            {tab === "directory" && (
              <CrmReference connectionId={connection.id} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
