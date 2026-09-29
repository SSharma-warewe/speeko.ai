import { Button } from "@call-agent/ui";
import { listUserWhatsAppOutboundMessages } from "../../lib/api";
import { formatRelative } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type Props = {
  /** Bump to refetch after a send. */
  refreshKey: number;
};

export default function WhatsAppHistoryTab({ refreshKey }: Props) {
  const { data, error, loading, reload } = useUserAsync(
    listUserWhatsAppOutboundMessages,
    [refreshKey],
  );
  const rows = data ?? [];

  return (
    <section className="ops-panel ops-desk-list">
      <div className="ops-desk-list-bar">
        <div className="ops-desk-list-bar-main">
          <span className="ops-desk-kicker">Sent messages</span>
          <span className="ops-desk-hint">{rows.length} recent</span>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={reload}>
          Refresh
        </Button>
      </div>
      <div className="ops-panel-body is-flush ops-desk-list-body">
        {loading && data === null ? (
          <LoadingBlock label="Loading sent messages" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            description="Template sends from the Send tab are logged here, including skipped and failed contacts."
          />
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table ops-desk-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Contact</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="ops-faint">{formatRelative(row.createdAt)}</td>
                    <td>
                      <div className="ops-desk-entity">
                        <span className="ops-desk-entity-name">
                          {row.contactName || row.phone}
                        </span>
                        {row.contactName ? (
                          <span className="ops-desk-entity-meta ops-mono">
                            {row.phone}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="ops-desk-entity">
                        <span className="ops-mono">{row.templateName}</span>
                        <span className="ops-desk-entity-meta">{row.language}</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        status={row.status === "sent" ? "success" : row.status === "failed" ? "failed" : "warn"}
                        label={row.status}
                      />
                    </td>
                    <td className="ops-faint">
                      {row.error ?? (row.wamid ? `${row.wamid.slice(0, 18)}…` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
