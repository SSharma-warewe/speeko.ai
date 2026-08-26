import { Link, useLocation } from "react-router-dom";

const SOLUTIONS = [
  {
    to: "/solutions/customer-service",
    title: "Customer Service",
    sub: "24×7 appointments & inbound resolution",
  },
  {
    to: "/solutions/marketing-sales",
    title: "Marketing & Sales",
    sub: "Lead gen, outreach & retention",
  },
] as const;

export default function MarketingNav() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";
  const hash = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  const onSolutions = pathname === "/solutions" || pathname.startsWith("/solutions/");
  const onHow = pathname === "/how-it-works";

  return (
    <nav className="lp-nav" aria-label="Primary">
      <Link to="/" className="lp-logo">
        Speeko
      </Link>
      <div className="lp-nav-links">
        <div className="lp-solutions">
          <Link to="/solutions" className={`lp-nav-link${onSolutions ? " is-active" : ""}`}>
            Solutions
          </Link>
          <div className="lp-mega" role="menu">
            {SOLUTIONS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`lp-mega-col${pathname === item.to ? " is-active" : ""}`}
                role="menuitem"
              >
                <span className="lp-mega-title">{item.title}</span>
                <span className="lp-mega-sub">{item.sub}</span>
              </Link>
            ))}
          </div>
        </div>
        <Link to="/how-it-works" className={`lp-nav-link${onHow ? " is-active" : ""}`}>
          How it works
        </Link>
        <a href={hash("integrations")} className="lp-nav-link">
          Integrations
        </a>
        <a href={hash("faq")} className="lp-nav-link">
          FAQ
        </a>
        <Link to="/get-demo" className="lp-nav-cta">
          Get a demo
        </Link>
      </div>
    </nav>
  );
}
