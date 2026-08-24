import { Link } from "react-router-dom";
import { listCalls } from "../../lib/api";
import { formatDateTime, shortId } from "../../lib/format";
import { CallCostCell } from "../components/CallCostCell";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function CallsListPage() {
  const { data, error, loading, reload } = useAsync(() => listCalls(80), []);

  if (loading) return <LoadingBlock label="Loading calls" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const calls = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="All calls"
        description="Platform-wide call log across web tests and SIP sessions."
      />

      <section className="ops-panel">
        <div className="ops-panel-body is-flush">
          {calls.length === 0 ? (
            <EmptyState
              title="No calls yet"
              description="Use Swagger or the API to start a test or outbound call."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Medium</th>
                    <th>Direction</th>
                    <th>Party</th>
                    <th>Task</th>
                    <th className="ops-calls-cost-col">Cost</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/admin-dashboard/calls/${c.id}`} className="ops-mono">
                          {shortId(c.id, 10)}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="ops-mono">{c.medium}</td>
                      <td>
                        <StatusBadge status={c.direction} />
                      </td>
                      <td className="ops-mono">
                        {c.direction === "inbound"
                          ? c.fromNumber || c.participantIdentity || "—"
                          : c.toNumber || c.participantIdentity || "—"}
                      </td>
                      <td className="ops-mono">{c.taskKey || "—"}</td>
                      <td className="ops-calls-cost-col">
                        <CallCostCell
                          cost={c.cost}
                          live={
                            c.status === "dialing" ||
                            c.status === "ready" ||
                            c.status === "creating"
                          }
                        />
                      </td>
                      <td className="ops-faint">{formatDateTime(c.createdAt)}</td>
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
