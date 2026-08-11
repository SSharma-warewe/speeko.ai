import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LiveDot } from "@call-agent/ui";
import { useUserAuth } from "../lib/auth";
import "./DashboardLayout.css";

const NAV = [
  {
    section: "Operate",
    items: [
      { to: "/dashboard", end: true, label: "Overview", desc: "Live queue & activity" },
      { to: "/dashboard/enqueue", label: "Enqueue", desc: "Bulk outbound dials" },
      { to: "/dashboard/dial", label: "Dial now", desc: "Immediate SIP call" },
      { to: "/dashboard/calls", label: "Calls", desc: "Status & transcripts" },
      { to: "/dashboard/batches", label: "Batches", desc: "Bulk campaign groups" },
    ],
  },
  {
    section: "Configure",
    items: [
      { to: "/dashboard/agents", label: "Agents", desc: "Persona, task & test" },
      { to: "/dashboard/queue", label: "Queue", desc: "Concurrency & retries" },
      { to: "/dashboard/sip", label: "SIP / Telephony", desc: "Outbound dials & inbound publish" },
      {
        to: "/dashboard/tool-profiles",
        label: "Tool profiles",
        desc: "Capability catalog",
      },
      {
        to: "/dashboard/integrations",
        label: "Integrations",
        desc: "CRM endpoints & API keys",
      },
    ],
  },
] as const;

function crumbFromPath(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname.startsWith("/dashboard/enqueue")) return "Enqueue";
  if (pathname.startsWith("/dashboard/dial")) return "Dial now";
  if (pathname.startsWith("/dashboard/calls")) return "Calls";
  if (pathname.startsWith("/dashboard/batches")) return "Batches";
  if (pathname.startsWith("/dashboard/agents")) return "Agents";
  if (pathname.startsWith("/dashboard/queue")) return "Queue";
  if (pathname.startsWith("/dashboard/sip")) return "SIP / Telephony";
  if (pathname.startsWith("/dashboard/tool-profiles")) return "Tool profiles";
  if (pathname.startsWith("/dashboard/integrations")) return "Integrations";
  return "Dashboard";
}

export default function UserDashboardLayout() {
  const { user, logout } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const crumb = crumbFromPath(location.pathname);
  const orgName = user?.organization?.name || user?.organization?.slug || "Organization";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="ops">
      <aside className="ops-sidebar" aria-label="Organization navigation">
        <NavLink to="/dashboard" className="ops-brand" end>
          <span className="ops-brand-mark">Speeko</span>
          <span className="ops-brand-sub">Ops desk · Org</span>
        </NavLink>

        <nav className="ops-nav">
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="ops-nav-section">{group.section}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) =>
                    `ops-nav-link${isActive ? " is-active" : ""}`
                  }
                >
                  <span className="ops-nav-label">{item.label}</span>
                  <span className="ops-nav-desc">{item.desc}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="ops-side-foot">
          <span className="ops-live-chip">
            <LiveDot />
            Live
          </span>
          <div className="ops-admin-meta">
            <span className="ops-admin-name">{user?.name || user?.email || "User"}</span>
            <span className="ops-admin-email">{orgName}</span>
          </div>
          <button type="button" className="ops-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="ops-main">
        <div className="ops-topbar">
          <div className="ops-crumb">
            <span>{orgName}</span>
            <span className="ops-crumb-sep" aria-hidden>
              /
            </span>
            <strong>{crumb}</strong>
          </div>
          <span className="ops-live-chip">
            <LiveDot />
            Org ops
          </span>
        </div>
        <main className="ops-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
