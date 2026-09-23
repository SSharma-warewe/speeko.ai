import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import "./KeywordPage.css";
import "./Solutions.css";

const LANES = [
  {
    to: "/solutions/ai-calling-agents",
    kicker: "Phone",
    title: "AI calling agents",
    body: "Inbound rings and outbound dials. The agent writes confirm, book, transfer, or hang up — only with the tools you enable.",
    go: "See the calls",
  },
  {
    to: "/solutions/whatsapp-services",
    kicker: "WhatsApp",
    title: "WhatsApp services",
    body: "Approved templates when you start the thread. A free-form reply for 24 hours after they message or call you.",
    go: "See the window",
  },
] as const;

export default function SolutionsIndexPage() {
  return (
    <div className="sol-page kw-page">
      <div className="kw-cover sol-hub-cover">
        <div className="sol-bar">
          <MarketingNav />
        </div>
        <div className="kw-cover-grid">
          <header className="kw-cover-copy">
            <p className="kw-kicker kw-rise">Solutions</p>
            <h1 className="kw-rise kw-rise-2">Two ways the work leaves the desk.</h1>
            <p className="kw-dek kw-rise kw-rise-3">
              A voice agent on the number you already have, or WhatsApp on Meta’s clock.
              Same company. Different room.
            </p>
          </header>
        </div>
      </div>

      <div className="kw-wrap sol-hub-lift">
        <div className="sol-hub-grid">
          {LANES.map((lane) => (
            <Link key={lane.to} to={lane.to} className="sol-hub-card">
              <span className="kw-kicker">{lane.kicker}</span>
              <h2>{lane.title}</h2>
              <p>{lane.body}</p>
              <span className="sol-lane-go">{lane.go} →</span>
            </Link>
          ))}
        </div>
      </div>

      <section className="kw-close">
        <div className="kw-wrap kw-close-inner">
          <div>
            <h2>Hear it, or read the thread.</h2>
            <p>Bring a number. Leave with an agent that can act, and a WhatsApp code that starts the demo.</p>
          </div>
          <Button as="a" href="/get-demo" variant="cta" size="lg" shine showArrow>
            Get a demo
          </Button>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
