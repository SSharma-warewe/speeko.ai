import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LiveDot } from "@call-agent/ui";
import { useUserAuth } from "../lib/auth";
import { initialsFromName } from "../lib/format";
import "./DashboardLayout.css";

type NavLeaf = {
  to: string;
  end?: boolean;
  label: string;
  desc: string;
};

type NavBranch = {
  label: string;
  desc: string;
  children: readonly NavLeaf[];
};

type NavItem = NavLeaf | NavBranch;

const NAV: { section: string; items: readonly NavItem[] }[] = [
  {
    section: "Operate",
    items: [
      { to: "/dashboard", end: true, label: "Overview", desc: "Live queue & activity" },
      { to: "/dashboard/calls", label: "Calls", desc: "History, enqueue & dial" },
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
        desc: "Assigned capabilities",
      },
      {
        to: "/dashboard/integrations",
        label: "Integrations",
        desc: "CRM endpoints & API keys",
      },
    ],
  },
];

function isBranch(item: NavItem): item is NavBranch {
  return "children" in item;
}

function pathInBranch(pathname: string, children: readonly NavLeaf[]): boolean {
  return children.some(
    (child) => pathname === child.to || pathname.startsWith(`${child.to}/`),
  );
}

function crumbFromPath(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname.startsWith("/dashboard/enqueue")) return "Calls";
  if (pathname.startsWith("/dashboard/dial")) return "Calls";
  if (pathname.startsWith("/dashboard/calls")) return "Calls";
  if (pathname.startsWith("/dashboard/batches")) return "Batches";
  if (pathname.startsWith("/dashboard/agents")) return "Agents";
  if (pathname.startsWith("/dashboard/queue")) return "Queue";
  if (pathname.startsWith("/dashboard/sip")) return "SIP / Telephony";
  if (pathname.startsWith("/dashboard/tool-profiles")) return "Tool profiles";
  if (pathname.startsWith("/dashboard/integrations")) return "Integrations";
  if (pathname.startsWith("/dashboard/account")) return "Account";
  return "Dashboard";
}

function NavBranchGroup({ item, pathname }: { item: NavBranch; pathname: string }) {
  const panelId = useId();
  const onSection = pathInBranch(pathname, item.children);
  const [open, setOpen] = useState(onSection);

  useEffect(() => {
    if (onSection) setOpen(true);
  }, [onSection]);

  return (
    <div className="ops-nav-group">
      <button
        type="button"
        className={`ops-nav-link ops-nav-toggle${open ? " is-open" : ""}${
          onSection ? " is-current" : ""
        }`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ops-nav-label-row">
          <span className="ops-nav-label">{item.label}</span>
          <span className="ops-nav-chevron" aria-hidden />
        </span>
        <span className="ops-nav-desc">{item.desc}</span>
      </button>
      <div
        id={panelId}
        className="ops-nav-sub"
        hidden={!open}
        role="group"
        aria-label={item.label}
      >
        {item.children.map((child) => (
          <NavLink
            key={child.to}
            to={child.to}
            className={({ isActive }) =>
              `ops-nav-link ops-nav-sublink${isActive ? " is-active" : ""}`
            }
          >
            <span className="ops-nav-label">{child.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
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
              {group.items.map((item) =>
                isBranch(item) ? (
                  <NavBranchGroup
                    key={item.label}
                    item={item}
                    pathname={location.pathname}
                  />
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      `ops-nav-link${isActive ? " is-active" : ""}`
                    }
                  >
                    <span className="ops-nav-label">{item.label}</span>
                    <span className="ops-nav-desc">{item.desc}</span>
                  </NavLink>
                ),
              )}
            </div>
          ))}
        </nav>

        <div className="ops-side-foot">
          <span className="ops-live-chip">
            <LiveDot />
            Live
          </span>
          <NavLink
            to="/dashboard/account"
            aria-label="Account"
            className={({ isActive }) =>
              `ops-side-account${isActive ? " is-active" : ""}`
            }
          >
            <span className="ops-side-avatar" aria-hidden>
              {initialsFromName(user?.name, user?.email)}
            </span>
            <span className="ops-admin-meta">
              <span className="ops-admin-name">{user?.name || user?.email || "User"}</span>
              <span className="ops-admin-email">{orgName}</span>
              <span className="ops-side-account-hint">Account</span>
            </span>
          </NavLink>
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
