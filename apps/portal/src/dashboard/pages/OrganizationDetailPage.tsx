import { NavLink, Outlet, useParams } from "react-router-dom";
import { getOrganization } from "../../lib/api";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { ResourceNotFound } from "../components/ResourceNotFound";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

const TABS = [
  { to: ".", end: true, label: "Overview" },
  { to: "users", label: "Users" },
  { to: "agents", label: "Agents" },
  { to: "tools", label: "Tools" },
  { to: "sip-trunks", label: "SIP trunks" },
  { to: "queue", label: "Queue" },
] as const;

export default function OrganizationDetailPage() {
  const { orgId = "" } = useParams();
  const { data: org, error, notFound, loading, reload } = useAsync(
    () => getOrganization(orgId),
    [orgId],
  );

  if (loading) return <LoadingBlock label="Loading organization" />;
  if (notFound || (!org && !error)) {
    return (
      <ResourceNotFound
        kind="Organization"
        id={orgId}
        backTo="/admin-dashboard/organizations"
        backLabel="All organizations"
      />
    );
  }
  if (error || !org) {
    return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Organization"
        title={org.name}
        description={`Slug ${org.slug} · Manage members, agents, tools, SIP, and dial queue for this tenant.`}
        actions={
          <StatusBadge
            status={org.isActive ? "active" : "inactive"}
            label={org.isActive ? "Active" : "Inactive"}
          />
        }
      />

      <nav className="ops-tabs" aria-label="Organization sections">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={"end" in tab ? tab.end : false}
            className={({ isActive }) => `ops-tab${isActive ? " is-active" : ""}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ org }} />
    </div>
  );
}
