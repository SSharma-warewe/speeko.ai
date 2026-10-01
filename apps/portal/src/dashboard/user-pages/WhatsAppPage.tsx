import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listUserOrgIntegrations } from "../../lib/api";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { useUserAsync } from "../hooks/useAsync";
import WhatsAppAgentTab from "./WhatsAppAgentTab";
import WhatsAppConnectionsTab from "./WhatsAppConnectionsTab";
import WhatsAppHistoryTab from "./WhatsAppHistoryTab";
import WhatsAppSendTab from "./WhatsAppSendTab";

type WaMode = "send" | "connections" | "history" | "agent";

function parseMode(raw: string | null): WaMode {
  if (raw === "connections") return "connections";
  if (raw === "history") return "history";
  if (raw === "agent") return "agent";
  return "send";
}

const TABS: { id: WaMode; label: string }[] = [
  { id: "send", label: "Send" },
  { id: "connections", label: "Connections" },
  { id: "agent", label: "Agent" },
  { id: "history", label: "History" },
];

export default function UserWhatsAppPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<WaMode>(parseMode(searchParams.get("tab")));
  const [historyKey, setHistoryKey] = useState(0);

  const { data, error, loading, reload } = useUserAsync(
    listUserOrgIntegrations,
    [],
  );

  useEffect(() => {
    setMode(parseMode(searchParams.get("tab")));
  }, [searchParams]);

  const setModeTab = (next: WaMode) => {
    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === "send") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  if (loading && !data) return <LoadingBlock label="Loading WhatsApp" />;
  if (error || !data) {
    return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;
  }

  const hasWhatsApp = data.some((c) => c.provider === "whatsapp" && c.isActive);
  const hasContacts = data.some(
    (c) =>
      (c.provider === "ghl_contacts" || c.provider === "ghl_crm") && c.isActive,
  );

  return (
    <div className="ops-desk">
      <div className="ops-desk-toolbar">
        <div className="ops-desk-toolbar-main">
          <h1>WhatsApp</h1>
          <div
            className="ops-mode-toggle"
            role="tablist"
            aria-label="WhatsApp sections"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                className={`ops-mode-btn${mode === tab.id ? " is-active" : ""}`}
                onClick={() => setModeTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="ops-desk-counts">
          <li>
            <span className={`ops-desk-stat${hasWhatsApp ? " is-on" : ""}`}>
              <strong>{hasWhatsApp ? "On" : "Off"}</strong>
              <span>whatsapp</span>
            </span>
          </li>
          <li>
            <span className={`ops-desk-stat${hasContacts ? " is-on" : ""}`}>
              <strong>{hasContacts ? "On" : "Off"}</strong>
              <span>contacts</span>
            </span>
          </li>
        </ul>
      </div>

      <div
        className={`ops-desk-board${
          mode === "history" || mode === "agent" ? " is-single" : ""
        }`}
      >
        {mode === "send" ? (
          <WhatsAppSendTab
            key={data
              .filter(
                (c) =>
                  c.isActive &&
                  (c.provider === "ghl_contacts" || c.provider === "ghl_crm"),
              )
              .map((c) => c.id)
              .join(",")}
            contactSources={data.filter(
              (c) =>
                c.isActive &&
                (c.provider === "ghl_contacts" || c.provider === "ghl_crm"),
            )}
            hasWhatsApp={hasWhatsApp}
            hasContacts={hasContacts}
            onGoConnections={() => setModeTab("connections")}
            onSent={() => setHistoryKey((k) => k + 1)}
          />
        ) : mode === "connections" ? (
          <WhatsAppConnectionsTab connections={data} onChanged={reload} />
        ) : mode === "agent" ? (
          <WhatsAppAgentTab
            hasWhatsApp={hasWhatsApp}
            onGoConnections={() => setModeTab("connections")}
          />
        ) : (
          <WhatsAppHistoryTab refreshKey={historyKey} />
        )}
      </div>
    </div>
  );
}
