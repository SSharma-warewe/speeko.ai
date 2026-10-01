import { Link, useSearchParams } from "react-router-dom";
import { Select } from "@call-agent/ui";
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
    <div className="ops-desk crm-workspace">
      <div className="ops-desk-toolbar">
        <div className="ops-desk-toolbar-main">
          <h1>CRM</h1>
          <p className="ops-desk-note">
            Your HighLevel workspace, live in Speeko.
          </p>
        </div>
        <div className="ops-row-actions">
          {connection && (
            <Select
              aria-label="CRM connection"
              value={connection.id}
              onChange={(e) => change("connection", e.target.value)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Link to="/dashboard/integrations?tab=crm">Manage connection →</Link>
        </div>
      </div>
      {!connection ? (
        <section className="ops-panel">
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
          <div
            className="ops-mode-toggle crm-tabs"
            role="tablist"
            aria-label="CRM pages"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`ops-mode-btn${tab === t.id ? " is-active" : ""}`}
                onClick={() => change("tab", t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            key={`${connection.id}-${tab}`}
            role="tabpanel"
            aria-label={TABS.find((t) => t.id === tab)?.label}
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
