import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LiveDot } from "@call-agent/ui";
import { useAdminAuth } from "../lib/auth";
import "./DashboardLayout.css";

const NAV = [
  {
    section: "Platform",
    items: [
      { to: "/admin-dashboard", end: true, label: "Overview", desc: "Queue & recent calls" },
      {
        to: "/admin-dashboard/organizations",
        label: "Organizations",
        desc: "Tenants & members",
      },
      {
        to: "/admin-dashboard/agents",
        label: "Agent templates",
        desc: "Platform personas",
      },
      {
        to: "/admin-dashboard/tool-profiles",
        label: "Tool profiles",
        desc: "Capability bundles",
      },
      { to: "/admin-dashboard/calls", label: "All calls", desc: "Transcripts & status" },
    ],
  },
] as const;

function crumbFromPath(pathname: string): string {
  if (pathname === "/admin-dashboard") return "Overview";
  if (pathname.startsWith("/admin-dashboard/organizations")) return "Organizations";
  if (pathname.startsWith("/admin-dashboard/agents")) return "Agent templates";
  if (pathname.startsWith("/admin-dashboard/tool-profiles")) return "Tool profiles";
  if (pathname.startsWith("/admin-dashboard/calls")) return "Calls";
  return "Dashboard";
}

export default function DashboardLayout() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const crumb = crumbFromPath(location.pathname);

  const handleLogout = () => {
    logout();
    navigate("/admin-login", { replace: true });
  };

  return (
    <div className="ops">
      <aside className="ops-sidebar" aria-label="Admin navigation">
        <NavLink to="/admin-dashboard" className="ops-brand" end>
          <span className="ops-brand-mark">Speeko</span>
          <span className="ops-brand-sub">Ops desk · Admin</span>
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
            <span className="ops-admin-name">{admin?.name || "Platform admin"}</span>
            <span className="ops-admin-email">{admin?.email}</span>
          </div>
          <button type="button" className="ops-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="ops-main">
        <div className="ops-topbar">
          <div className="ops-crumb">
            <span>Admin</span>
            <span className="ops-crumb-sep" aria-hidden>
              /
            </span>
            <strong>{crumb}</strong>
          </div>
          <span className="ops-live-chip">
            <LiveDot />
            Platform
          </span>
        </div>
        <main className="ops-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
