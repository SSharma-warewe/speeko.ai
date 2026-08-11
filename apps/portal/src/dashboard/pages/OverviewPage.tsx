import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import { getAdminQueueStats, listCalls, listOrganizations } from "../../lib/api";
import { formatDateTime, formatRelative, shortId } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { KpiCard } from "../components/KpiCard";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function OverviewPage() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [stats, orgs, calls] = await Promise.all([
      getAdminQueueStats(),
      listOrganizations(),
      listCalls(12),
    ]);
    return { stats, orgs, calls };
  }, []);

  if (loading) return <LoadingBlock label="Loading overview" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const { stats, orgs, calls } = data;
  const totals = stats.totals;

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Ops overview"
        description="Live queue health across tenants, dialer status, and the latest call activity."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <div className="ops-kpis">
        <KpiCard value={orgs.length} label="Organizations" hint={`${totals.orgsEnabled} queue enabled`} />
        <KpiCard value={totals.pending} label="Pending" hint="Waiting to dial" />
        <KpiCard
          value={totals.inProgress}
          label="In progress"
          hint="Creating / dialing / ready"
          highlight={totals.inProgress > 0}
        />
        <KpiCard value={totals.completed} label="Completed" hint={`${totals.failed} failed`} />
      </div>

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Recent calls</h2>
            <Link to="/admin-dashboard/calls" className="ops-mono">
              View all →
            </Link>
          </div>
          <div className="ops-panel-body is-flush">
            {calls.length === 0 ? (
              <div className="ops-state">
                <p>No calls yet. Start a web test or outbound dial from the API.</p>
              </div>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Direction</th>
                      <th>To</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link to={`/admin-dashboard/calls/${c.id}`}>
                            <StatusBadge status={c.status} />
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={c.direction} />
                        </td>
                        <td className="ops-mono">{c.toNumber || c.participantIdentity || "—"}</td>
                        <td className="ops-faint">{formatRelative(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Dialer health</h2>
            <StatusBadge
              status={stats.dialer.globalEnabled ? "live" : "inactive"}
              label={stats.dialer.globalEnabled ? "Enabled" : "Disabled"}
            />
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>Last tick</dt>
                <dd>{formatDateTime(stats.dialer.lastTickAt)}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Last claim count</dt>
                <dd>{stats.dialer.lastClaimCount}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Orgs paused</dt>
                <dd>{totals.orgsPaused}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>As of</dt>
                <dd>{formatDateTime(stats.asOf)}</dd>
              </div>
            </dl>
            {stats.dialer.lastError ? (
              <p className="ops-muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
                Last error: {stats.dialer.lastError}
              </p>
            ) : null}

            <div style={{ marginTop: "1.25rem" }}>
              <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.85rem" }}>Organizations</h3>
              {orgs.length === 0 ? (
                <p className="ops-muted" style={{ margin: 0 }}>
                  No tenants yet.{" "}
                  <Link to="/admin-dashboard/organizations">Create one →</Link>
                </p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.45rem" }}>
                  {orgs.slice(0, 6).map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/admin-dashboard/organizations/${o.id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          textDecoration: "none",
                          color: "inherit",
                          padding: "0.45rem 0.55rem",
                          borderRadius: 8,
                          border: "1px solid var(--ops-line)",
                          background: "#fafafa",
                        }}
                      >
                        <strong style={{ fontSize: "0.85rem" }}>{o.name}</strong>
                        <span className="ops-mono">{shortId(o.slug, 16)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
