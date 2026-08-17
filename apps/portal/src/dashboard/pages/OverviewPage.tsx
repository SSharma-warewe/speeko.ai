import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import { getAdminQueueStats, listCalls, listOrganizations } from "../../lib/api";
import { formatRelative, shortId } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
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
    <div className="ops-ov">
      <div className="ops-ov-strip">
        <div className="ops-ov-strip-live">
          <StatusBadge
            status={stats.dialer.globalEnabled ? "live" : "inactive"}
            label={stats.dialer.globalEnabled ? "Dialer on" : "Dialer off"}
          />
          <span className="ops-ov-strip-meta">
            <span>tick {formatRelative(stats.dialer.lastTickAt)}</span>
            <span className="ops-ov-dot" aria-hidden>
              ·
            </span>
            <span>claimed {stats.dialer.lastClaimCount}</span>
            <span className="ops-ov-dot" aria-hidden>
              ·
            </span>
            <span>{totals.orgsPaused} orgs paused</span>
            <span className="ops-ov-dot" aria-hidden>
              ·
            </span>
            <span>as of {formatRelative(stats.asOf)}</span>
          </span>
          {stats.dialer.lastError ? (
            <span className="ops-ov-strip-error" title={stats.dialer.lastError}>
              {stats.dialer.lastError}
            </span>
          ) : null}
        </div>
        <div className="ops-ov-strip-actions">
          <Button type="button" variant="secondary" size="sm" onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="ops-ov-kpis ops-ov-kpis--admin" role="list">
        <Link to="/admin-dashboard/organizations" className="ops-ov-kpi" role="listitem">
          <span className="ops-ov-kpi-label">Orgs</span>
          <span className="ops-ov-kpi-value">{orgs.length}</span>
          <span className="ops-ov-kpi-hint">{totals.orgsEnabled} queue on</span>
        </Link>
        <Link to="/admin-dashboard/calls" className="ops-ov-kpi" role="listitem">
          <span className="ops-ov-kpi-label">Pending</span>
          <span className="ops-ov-kpi-value">{totals.pending}</span>
          <span className="ops-ov-kpi-hint">waiting to dial</span>
        </Link>
        <Link
          to="/admin-dashboard/calls"
          className={`ops-ov-kpi${totals.inProgress > 0 ? " is-live" : ""}`}
          role="listitem"
        >
          <span className="ops-ov-kpi-label">In progress</span>
          <span className="ops-ov-kpi-value">{totals.inProgress}</span>
          <span className="ops-ov-kpi-hint">creating / dialing / live</span>
        </Link>
        <Link to="/admin-dashboard/calls" className="ops-ov-kpi" role="listitem">
          <span className="ops-ov-kpi-label">Completed</span>
          <span className="ops-ov-kpi-value">{totals.completed}</span>
          <span className="ops-ov-kpi-hint">finished ok</span>
        </Link>
        <Link
          to="/admin-dashboard/calls"
          className={`ops-ov-kpi${totals.failed > 0 ? " is-bad" : ""}`}
          role="listitem"
        >
          <span className="ops-ov-kpi-label">Failed</span>
          <span className="ops-ov-kpi-value">{totals.failed}</span>
          <span className="ops-ov-kpi-hint">{totals.cancelled} cancelled</span>
        </Link>
        <Link
          to="/admin-dashboard/organizations"
          className={`ops-ov-kpi${totals.orgsPaused > 0 ? " is-warn" : ""}`}
          role="listitem"
        >
          <span className="ops-ov-kpi-label">Paused</span>
          <span className="ops-ov-kpi-value">{totals.orgsPaused}</span>
          <span className="ops-ov-kpi-hint">orgs on hold</span>
        </Link>
      </div>

      <div className="ops-ov-floor">
        <section className="ops-panel ops-ov-cell">
          <div className="ops-panel-head">
            <h2>Recent calls</h2>
            <Link to="/admin-dashboard/calls" className="ops-mono">
              View all →
            </Link>
          </div>
          <div className="ops-ov-ticker-body">
            {calls.length === 0 ? (
              <div className="ops-ov-empty">
                <p>No calls yet. Start a web test or outbound dial from the API.</p>
              </div>
            ) : (
              <ol className="ops-ov-tape">
                {calls.map((c) => {
                  const live =
                    c.status === "dialing" || c.status === "ready" || c.status === "creating";
                  return (
                    <li key={c.id}>
                      <Link
                        to={`/admin-dashboard/calls/${c.id}`}
                        className={`ops-ov-tape-row${live ? " is-live" : ""}`}
                      >
                        <StatusBadge status={c.status} />
                        <span className="ops-ov-tape-to">
                          {c.toNumber || c.participantIdentity || "—"}
                        </span>
                        <span className="ops-ov-tape-task">{c.taskKey || "—"}</span>
                        <span className="ops-ov-tape-meta">
                          {c.direction}
                          <span aria-hidden> · </span>
                          {c.medium}
                        </span>
                        <span className="ops-ov-tape-try">{shortId(c.id, 8)}</span>
                        <time className="ops-ov-tape-when" dateTime={c.createdAt}>
                          {formatRelative(c.createdAt)}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <aside className="ops-ov-side">
          <section className="ops-panel">
            <div className="ops-panel-head">
              <h2>Organizations</h2>
              <Link to="/admin-dashboard/organizations" className="ops-mono">
                All →
              </Link>
            </div>
            <div className="ops-panel-body is-flush">
              {orgs.length === 0 ? (
                <div className="ops-ov-empty">
                  <p>
                    No tenants yet.{" "}
                    <Link to="/admin-dashboard/organizations">Create one</Link>.
                  </p>
                </div>
              ) : (
                <ul className="ops-ov-side-list">
                  {orgs.slice(0, 8).map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/admin-dashboard/organizations/${o.id}`}
                        className="ops-ov-side-row"
                      >
                        <StatusBadge
                          status={o.isActive ? "active" : "inactive"}
                          label={o.isActive ? "on" : "off"}
                        />
                        <span className="ops-ov-side-copy">
                          <strong>{o.name}</strong>
                          <span className="ops-mono">{o.slug}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
