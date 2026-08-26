import { Link } from "react-router-dom";

export default function MarketingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-top">
        <div className="lp-footer-brand">
          <Link to="/" className="lp-footer-logo">
            Speeko
          </Link>
          <p className="lp-footer-tagline">
            Voice agents that place and answer calls — with live transcripts, real outcomes,
            and a dashboard your team actually uses.
          </p>
        </div>
        <div className="lp-footer-cols">
          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Product</p>
            <Link to="/solutions">Solutions</Link>
            <Link to="/solutions/customer-service">Customer Service</Link>
            <Link to="/solutions/marketing-sales">Marketing &amp; Sales</Link>
            <Link to="/how-it-works">How it works</Link>
            <a href="/#integrations">Integrations</a>
            <a href="/#faq">FAQ</a>
          </div>
          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Get started</p>
            <Link to="/get-demo">Get a demo</Link>
          </div>
          <div className="lp-footer-col">
            <p className="lp-footer-col-title">Legal</p>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
          </div>
        </div>
      </div>
      <div className="lp-footer-bottom">
        <span>© {new Date().getFullYear()} Speeko. All rights reserved.</span>
        <span className="lp-footer-meta">Inbound + outbound · Built for clinics &amp; teams</span>
      </div>
    </footer>
  );
}
