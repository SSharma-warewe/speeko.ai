import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import { ProfileComposer, ToolCatalog, ToolIdChain } from "../components/ToolBench";
import {
  AGENT_FIT,
  AGENT_HELPS,
  HUB_STARTER_IDS,
  LANES,
  PROFILE_EXAMPLES,
} from "../data/solutions";
import { useDocumentTitle } from "../lib/document-title";
import "./Solutions.css";

export default function SolutionsIndexPage() {
  useDocumentTitle("Solutions — Speeko");

  return (
    <div className="sol-page">
      <div className="sol-bar">
        <MarketingNav />
      </div>

      <header className="sol-wrap sol-mast">
        <p className="sol-kicker">Tools</p>
        <h1>The verbs on the call.</h1>
        <p className="sol-lead">
          Agents only run tools you enable. Assemble a profile from this list — hang up, look
          someone up, check a calendar, book, cancel, transfer. You do not upload code.
        </p>
      </header>

      <section className="sol-band" aria-labelledby="sol-inventory-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Inventory</p>
              <h2 id="sol-inventory-h">What we ship.</h2>
            </div>
            <p className="sol-lead">
              Hard-coded worker actions, not prompts. Calendar and GoHighLevel talk to the
              connection on the agent.
            </p>
          </div>
          <ToolCatalog />
        </div>
      </section>

      <section className="sol-band" aria-labelledby="sol-help-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Help</p>
              <h2 id="sol-help-h">What an agent can take off the desk.</h2>
            </div>
            <p className="sol-lead">
              Same tools as above. The difference is which ones you switch on — and what the
              call is allowed to finish.
            </p>
          </div>
          <div className="sol-bento sol-bento--help">
            {AGENT_HELPS.map((card) => (
              <Link key={card.id} to={card.href} className="sol-bento-tile sol-help-card">
                <span className="sol-recipe-kind">{card.kicker}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="sol-profiles-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Profiles</p>
              <h2 id="sol-profiles-h">Platform seeds, then your own mix.</h2>
            </div>
            <p className="sol-lead">
              Two starters on day one. Custom profiles are a pick of known ids. Hangup is always
              on.
            </p>
          </div>
          <div className="sol-bento">
            {PROFILE_EXAMPLES.map((profile) => (
              <article
                key={profile.key}
                className={`sol-bento-tile is-${profile.key}${profile.key === "demo-setter" ? " is-ink" : ""}`}
              >
                <span className="sol-recipe-kind">
                  {profile.kind === "platform" ? "Platform seed" : "Custom example"}
                </span>
                <h3>{profile.name}</h3>
                <p>{profile.accomplishes}</p>
                <ToolIdChain ids={profile.toolIds} />
              </article>
            ))}
            <div className="sol-bento-tile is-compose">
              <ProfileComposer
                compact
                headingId="sol-compose-h"
                title="Toggle a mix. Read the job."
                lead="The sentence is what that agent is allowed to finish on the phone."
                initialIds={HUB_STARTER_IDS}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="sol-fit-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Fit</p>
              <h2 id="sol-fit-h">How it sits with your team.</h2>
            </div>
            <p className="sol-lead">
              The agent does not replace the calendar or the CRM. It talks, it runs the tools
              you enabled, then it stops.
            </p>
          </div>
          <div className="sol-bento sol-bento--fit">
            {AGENT_FIT.map((item) => (
              <article key={item.step} className="sol-bento-tile sol-fit-tile">
                <span className="sol-fit-step">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sol-band sol-band--last" aria-labelledby="sol-lanes-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Jobs</p>
              <h2 id="sol-lanes-h">Same tools, two stacks.</h2>
            </div>
            <p className="sol-lead">
              Customer service works the book. Marketing books the next meeting.
            </p>
          </div>
          <div className="sol-bento sol-bento--lanes">
            {(
              [
                LANES["customer-service"],
                LANES["marketing-sales"],
              ] as const
            ).map((lane) => (
              <Link key={lane.slug} to={`/solutions/${lane.slug}`} className="sol-bento-tile sol-lane">
                <span className="sol-kicker">{lane.kicker}</span>
                <h3>{lane.title}</h3>
                <p>{lane.lead}</p>
                <span className="sol-lane-go">See the playbooks →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="sol-wrap sol-close">
        <div className="sol-close-inner">
          <div>
            <h2>Try it on a live number.</h2>
            <p>Bring a calendar or a GHL token. Leave with an agent that can act.</p>
          </div>
          <Button as="a" href="/get-demo" variant="cta" size="lg" shine showArrow>
            Get a demo
          </Button>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
