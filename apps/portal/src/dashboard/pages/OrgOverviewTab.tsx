import { Link, useOutletContext, useParams } from "react-router-dom";
import type { Organization } from "../../lib/api";
import {
  getAdminCostSummary,
  getOrgQueueStats,
  listOrgAgents,
  listOrgUsers,
  listSipTrunks,
} from "../../lib/api";
import { formatDateTime, formatUsd } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { KpiCard } from "../components/KpiCard";
import { LoadingBlock } from "../components/LoadingBlock";
import { useAsync } from "../hooks/useAsync";

export default function OrgOverviewTab() {
  const { orgId = "" } = useParams();
  const { org } = useOutletContext<{ org: Organization }>();

  const { data, error, loading, reload } = useAsync(async () => {
    const [stats, users, agents, trunks, costs] = await Promise.all([
      getOrgQueueStats(orgId),
      listOrgUsers(orgId),
      listOrgAgents(orgId),
      listSipTrunks(orgId),
      getAdminCostSummary({ organizationId: orgId }),
    ]);
    return { stats, users, agents, trunks, costs };
  }, [orgId]);

  if (loading) return <LoadingBlock label="Loading org overview" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  const { stats, users, agents, trunks, costs } = data;

  return (
    <div className="ops-stack">
      <div className="ops-kpis">
        <KpiCard value={users.length} label="Users" />
        <KpiCard value={agents.length} label="Agents" />
        <KpiCard value={trunks.length} label="SIP trunks" />
        <KpiCard
          value={stats.counts.pending}
          label="Queue pending"
          hint={`${stats.queue.inProgress} in flight`}
          highlight={stats.queue.inProgress > 0}
        />
        <KpiCard
          value={formatUsd(costs.totalUsd)}
          label="30d spend"
          hint={
            costs.callCount > 0
              ? `${formatUsd(costs.avgUsd)} avg · list price`
              : "LiveKit list price"
          }
        />
      </div>

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Tenant</h2>
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>Name</dt>
                <dd>{org.name}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Slug</dt>
                <dd className="ops-mono">{org.slug}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>ID</dt>
                <dd className="ops-mono">{org.id}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Created</dt>
                <dd>{formatDateTime(org.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Quick links</h2>
          </div>
          <div className="ops-panel-body">
            <div className="ops-chip-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              {[
                { to: "users", label: "Manage users", desc: "Add org members" },
                { to: "agents", label: "Org agents", desc: "Assign templates" },
                { to: "sip-trunks", label: "SIP trunks", desc: "Link or provision" },
                { to: "queue", label: "Dial queue", desc: "Concurrency & retries" },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.7rem 0.85rem",
                    borderRadius: 10,
                    border: "1px solid var(--ops-line)",
                    textDecoration: "none",
                    color: "inherit",
                    background: "#fafafa",
                  }}
                >
                  <span>
                    <strong style={{ display: "block", fontSize: "0.88rem" }}>{item.label}</strong>
                    <span className="ops-faint" style={{ fontSize: "0.75rem" }}>
                      {item.desc}
                    </span>
                  </span>
                  <span className="ops-faint">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
