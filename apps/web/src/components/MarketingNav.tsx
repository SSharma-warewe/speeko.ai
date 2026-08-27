import { useEffect, useId, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const onHome = pathname === "/";
  const hash = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  const onSolutions = pathname === "/solutions" || pathname.startsWith("/solutions/");
  const onHow = pathname === "/how-it-works";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 720px)");
    const closeOnDesk = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", closeOnDesk);
    return () => media.removeEventListener("change", closeOnDesk);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("lp-nav-lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("lp-nav-lock");
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <nav className={`lp-nav${open ? " is-open" : ""}`} aria-label="Primary">
      <Link to="/" className="lp-logo" onClick={close}>
        Speeko
      </Link>
      <button
        type="button"
        className="lp-nav-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="lp-nav-toggle-bars" aria-hidden />
      </button>
      {open ? (
        <button
          type="button"
          className="lp-nav-overlay"
          tabIndex={-1}
          aria-hidden
          onClick={close}
        />
      ) : null}
      <div id={panelId} className="lp-nav-links">
        <div className="lp-solutions">
          <Link
            to="/solutions"
            className={`lp-nav-link${onSolutions ? " is-active" : ""}`}
            onClick={close}
          >
            Solutions
          </Link>
          <div className="lp-mega" role="menu">
            {SOLUTIONS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`lp-mega-col${pathname === item.to ? " is-active" : ""}`}
                role="menuitem"
                onClick={close}
              >
                <span className="lp-mega-title">{item.title}</span>
                <span className="lp-mega-sub">{item.sub}</span>
              </Link>
            ))}
          </div>
        </div>
        <Link
          to="/how-it-works"
          className={`lp-nav-link${onHow ? " is-active" : ""}`}
          onClick={close}
        >
          How it works
        </Link>
        <a href={hash("integrations")} className="lp-nav-link" onClick={close}>
          Integrations
        </a>
        <a href={hash("faq")} className="lp-nav-link" onClick={close}>
          FAQ
        </a>
        <Link to="/get-demo" className="lp-nav-cta" onClick={close}>
          Get a demo
        </Link>
      </div>
    </nav>
  );
}
