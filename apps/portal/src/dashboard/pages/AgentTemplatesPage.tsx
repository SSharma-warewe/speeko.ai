import { Link } from "react-router-dom";
import { listAgentTemplates } from "../../lib/api";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function AgentTemplatesPage() {
  const { data, error, loading, reload } = useAsync(listAgentTemplates, []);

  if (loading) return <LoadingBlock label="Loading templates" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const agents = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Agent templates"
        description="Seeded personas used when you assign agents to an organization. Workflow lives in tasks; tools come from profiles."
      />

      <section className="ops-panel">
        <div className="ops-panel-body is-flush">
          {agents.length === 0 ? (
            <EmptyState title="No templates" description="API seed should create inbound and outbound templates on boot." />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Direction</th>
                    <th>Task</th>
                    <th>Tools</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/admin-dashboard/agents/${a.id}`}>{a.name}</Link>
                      </td>
                      <td className="ops-mono">{a.key}</td>
                      <td>
                        <StatusBadge status={a.direction} />
                      </td>
                      <td className="ops-mono">{a.defaultTaskKey}</td>
                      <td>
                        <div className="ops-chip-row">
                          {(a.enabledTools ?? []).slice(0, 3).map((t) => (
                            <span key={t} className="ops-tool-chip">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          status={a.isActive ? "active" : "inactive"}
                          label={a.isActive ? "Active" : "Inactive"}
                        />
                      </td>
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
