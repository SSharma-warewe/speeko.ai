import { Link } from "react-router-dom";
import { Button, LiveDot } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import { ToolIdChain } from "../components/ToolBench";
import { KEYWORD_NAV, KEYWORD_PAGE_BY_PATH } from "../data/keyword-pages";
import { LANES } from "../data/solutions";
import "./KeywordPage.css";
import "./Solutions.css";

const STACKS = [
  {
    kicker: "Clinic desk",
    lane: LANES["customer-service"],
  },
  {
    kicker: "Demo setter",
    lane: LANES["marketing-sales"],
  },
] as const;

export default function AiCallingPage() {
  const page = KEYWORD_PAGE_BY_PATH["/ai-voice-agent"];

  return (
    <div className="sol-page kw-page">
      <div className="kw-cover">
        <div className="sol-bar">
          <MarketingNav />
        </div>

        <div className="kw-cover-grid">
          <header className="kw-cover-copy">
            <p className="kw-kicker kw-rise">AI calling agents</p>
            <h1 className="kw-rise kw-rise-2">{page.h1}</h1>
            <p className="kw-dek kw-rise kw-rise-3">{page.dek}</p>
            <div className="kw-cover-actions kw-rise kw-rise-4">
              <Button as="a" href="/get-demo" variant="cta" size="lg" shine showArrow>
                Get a demo
              </Button>
              <Button
                as="a"
                href="/solutions/whatsapp-services"
                variant="ghostOnDark"
                size="lg"
              >
                WhatsApp services
              </Button>
            </div>
            <ul className="kw-ticks kw-rise kw-rise-5" aria-label="On this call">
              {page.chips.map((chip) => (
                <li key={chip}>{chip}</li>
              ))}
            </ul>
          </header>

          <aside className="kw-tape kw-rise kw-rise-3" aria-label="Call tape preview">
            <div className="kw-tape-chrome">
              <span className="kw-tape-dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className="kw-tape-live">
                <LiveDot />
                Live
              </span>
            </div>
            <p className="kw-tape-meta">{page.tape.meta}</p>
            <h2 className="kw-tape-name">{page.tape.name}</h2>
            <blockquote className="kw-tape-line">
              <p>{page.tape.line}</p>
            </blockquote>
            <p className="kw-tape-stamp">{page.tape.stamp}</p>
          </aside>
        </div>
      </div>

      <section className="kw-lede" aria-label="What the agent finishes">
        <div className="kw-wrap kw-lede-grid">
          {page.outcomes.map((item, index) => (
            <article
              key={item.verb}
              className={`kw-lede-tile${index === 0 ? " is-lead" : ""}`}
            >
              <p className="kw-kicker">{item.verb}</p>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sol-jobs" aria-labelledby="sol-jobs-h">
        <div className="kw-wrap">
          <p className="kw-kicker">Jobs</p>
          <h2 id="sol-jobs-h">The calls we already run.</h2>
          <div className="sol-job-grid">
            {KEYWORD_NAV.map((item) => {
              const lander = KEYWORD_PAGE_BY_PATH[item.to];
              return (
                <Link key={item.to} to={item.to} className="sol-job-tile">
                  <span className="kw-kicker">{lander.kicker}</span>
                  <h3>{lander.h1}</h3>
                  <p>{lander.outcomes[0]?.body}</p>
                  <span className="sol-lane-go">{item.title} →</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sol-stacks" aria-labelledby="sol-stacks-h">
        <div className="kw-wrap">
          <div className="sol-stacks-head">
            <div>
              <p className="kw-kicker">Profiles</p>
              <h2 id="sol-stacks-h">Same agent. Two jobs it can finish.</h2>
            </div>
            <p>
              Hangup is always on. Calendar, confirm, and GoHighLevel only run if you switch
              them on. Speech does not invent a booking.
            </p>
          </div>
          <div className="sol-stacks-grid">
            {STACKS.map((stack) => (
              <article key={stack.kicker}>
                <p className="kw-kicker">{stack.kicker}</p>
                <h3>{stack.lane.headline}</h3>
                <p>{stack.lane.lead}</p>
                <ToolIdChain ids={[...stack.lane.starterIds]} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="kw-live" aria-labelledby="kw-live-h">
        <div className="kw-wrap kw-live-row">
          <div>
            <p className="kw-kicker">Go live</p>
            <h2 id="kw-live-h">On a number you already have.</h2>
            <p className="kw-live-body">{page.goLive}</p>
          </div>
          <Link to="/how-it-works" className="kw-live-go">
            Walk the setup →
          </Link>
        </div>
      </section>

      <section className="kw-close">
        <div className="kw-wrap kw-close-inner">
          <div>
            <h2>{page.closeTitle}</h2>
            <p>{page.closeBody}</p>
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
