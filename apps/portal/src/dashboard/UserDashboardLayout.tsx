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
      {
        to: "/dashboard",
        end: true,
        label: "Overview",
        desc: "Voice, WhatsApp & CRM",
      },
      {
        to: "/dashboard/calls",
        label: "Calls",
        desc: "History, enqueue & dial",
      },
      {
        to: "/dashboard/batches",
        label: "Batches",
        desc: "Bulk campaign groups",
      },
      {
        to: "/dashboard/whatsapp",
        label: "WhatsApp",
        desc: "Import contacts & send templates",
      },
      {
        to: "/dashboard/crm",
        label: "CRM",
        desc: "Contacts, calendars & pipelines",
      },
    ],
  },
  {
    section: "Configure",
    items: [
      {
        to: "/dashboard/tasks", label: "Tasks", desc: "Workflows & completion",
      },
      {
        to: "/dashboard/agents",
        label: "Agents",
        desc: "Persona, task & test",
      },
      { to: "/dashboard/queue", label: "Queue", desc: "Concurrency & retries" },
      {
        to: "/dashboard/sip",
        label: "SIP / Telephony",
        desc: "Outbound dials & inbound publish",
      },
      {
        to: "/dashboard/tool-profiles",
        label: "Tool profiles",
        desc: "Assigned capabilities",
      },
      {
        to: "/dashboard/integrations",
        label: "Integrations",
        desc: "CRM, calendar & WhatsApp",
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
  if (pathname.startsWith("/dashboard/tasks")) return "Tasks";
  if (pathname.startsWith("/dashboard/crm")) return "CRM";
  if (pathname === "/dashboard") return "Overview";
  if (pathname.startsWith("/dashboard/enqueue")) return "Calls";
  if (pathname.startsWith("/dashboard/dial")) return "Calls";
  if (pathname.startsWith("/dashboard/calls")) return "Calls";
  if (pathname.startsWith("/dashboard/batches")) return "Batches";
  if (pathname.startsWith("/dashboard/whatsapp")) return "WhatsApp";
  if (pathname.startsWith("/dashboard/agents")) return "Agents";
  if (pathname.startsWith("/dashboard/queue")) return "Queue";
  if (pathname.startsWith("/dashboard/sip")) return "SIP / Telephony";
  if (pathname.startsWith("/dashboard/tool-profiles")) return "Tool profiles";
  if (pathname.startsWith("/dashboard/integrations")) return "Integrations";
  if (pathname.startsWith("/dashboard/account")) return "Account";
  return "Dashboard";
}

function NavBranchGroup({
  item,
  pathname,
}: {
  item: NavBranch;
  pathname: string;
}) {
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavId = useId();
  useEffect(() => setMobileMenuOpen(false), [location.pathname]);
  const crumb = crumbFromPath(location.pathname);
  const orgName =
    user?.organization?.name || user?.organization?.slug || "Organization";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="ops">
      <aside
        className={`ops-sidebar ops-org-sidebar${mobileMenuOpen ? " is-menu-open" : ""}`}
        aria-label="Organization navigation"
      >
        <div className="ops-mobile-brand-row">
          <NavLink to="/dashboard" className="ops-brand" end>
            <span className="ops-brand-mark">Speeko</span>
            <span className="ops-brand-sub">Ops desk · Org</span>
          </NavLink>
          <button
            type="button"
            className="ops-mobile-menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileNavId}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? "Close menu" : "Menu"}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
            >
              <path
                d={
                  mobileMenuOpen
                    ? "M6 6l12 12M6 18L18 6"
                    : "M4 6h16M4 12h16M4 18h16"
                }
              />
            </svg>
          </button>
        </div>

        <nav className="ops-nav" id={mobileNavId}>
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
              <span className="ops-admin-name">
                {user?.name || user?.email || "User"}
              </span>
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
