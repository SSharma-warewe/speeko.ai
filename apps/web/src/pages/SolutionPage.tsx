import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import { ProfileComposer, ToolIdChain } from "../components/ToolBench";
import { LANES, TOOL_BY_ID, toolChip, type SolutionSlug } from "../data/solutions";
import "./Solutions.css";

export default function SolutionPage({ slug }: { slug: SolutionSlug }) {
  const lane = LANES[slug];
  const [playId, setPlayId] = useState(lane.playbooks[0].id);
  const play = lane.playbooks.find((item) => item.id === playId) ?? lane.playbooks[0];

  useEffect(() => {
    setPlayId(LANES[slug].playbooks[0].id);
  }, [slug]);

  return (
    <div className="sol-page">
      <div className="sol-bar">
        <MarketingNav />
      </div>

      <header className="sol-wrap sol-mast">
        <p className="sol-kicker">{lane.kicker}</p>
        <h1>{lane.headline}</h1>
        <p className="sol-lead">{lane.lead}</p>
        <ul className="sol-mast-chips">
          {lane.starterIds.map((id) => (
            <li key={id}>{toolChip(id)}</li>
          ))}
        </ul>
      </header>

      <section className="sol-band" aria-labelledby="sol-lane-help-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Help</p>
              <h2 id="sol-lane-help-h">What this stack takes off the desk.</h2>
            </div>
            <p className="sol-lead">
              Humans keep the exceptions. The agent finishes the jobs those tools can actually
              write back.
            </p>
          </div>
          <div className="sol-bento sol-bento--help">
            {lane.helps.map((card) => (
              <article key={card.title} className="sol-bento-tile">
                <span className="sol-recipe-kind">{card.kicker}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="sol-play-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Playbooks</p>
              <h2 id="sol-play-h">What this stack can finish.</h2>
            </div>
            <p className="sol-lead">
              Each job is a tool chain. Speech is the persona. The outcome exists only if those
              tools ran.
            </p>
          </div>
          <div className="sol-play-layout">
            <div className="sol-play-tabs" role="tablist" aria-label="Playbooks">
              {lane.playbooks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={play.id === item.id}
                  className={`sol-play-tab${play.id === item.id ? " is-active" : ""}`}
                  onClick={() => setPlayId(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.job}</span>
                </button>
              ))}
            </div>
            <article className="sol-play-panel" key={play.id}>
              <h3>{play.title}</h3>
              <p className="sol-lead">{play.accomplishes}</p>
              <ToolIdChain ids={play.toolIds} />
              <ol className="sol-beats">
                {play.beats.map((beat, idx) => (
                  <li key={idx}>
                    <span className={`sol-beat-tool${beat.toolId ? "" : " is-talk"}`}>
                      {beat.toolId ? toolChip(beat.toolId) : "speech"}
                    </span>
                    <span>{beat.text}</span>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="sol-kit-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Kit</p>
              <h2 id="sol-kit-h">Tools this team enables.</h2>
            </div>
            <p className="sol-lead">
              Leave one off and the agent cannot do that verb. Hangup is always included.
            </p>
          </div>
          <div className="sol-bento sol-bento--kit">
            {lane.starterIds.map((id) => {
              const tool = TOOL_BY_ID[id];
              return (
                <article key={id} className="sol-bento-tile">
                  <span className="sol-recipe-kind">{toolChip(tool.id)}</span>
                  <h3>{tool.label}</h3>
                  <p>{tool.accomplishes}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sol-band">
        <div className="sol-wrap">
          <ProfileComposer
            key={slug}
            compact
            headingId="sol-remix-h"
            title="Remix this lane."
            lead="Start from this kit. Add calendar, GHL, or transfer — the sentence updates."
            initialIds={lane.starterIds}
          />
        </div>
      </section>

      <div className="sol-wrap sol-band sol-band--last">
        <Link to={`/solutions/${lane.other.slug}`} className="sol-cross">
          <div>
            <p className="sol-kicker">Other stack</p>
            <h2>{lane.other.title}</h2>
            <p>{lane.other.body}</p>
          </div>
          <span className="sol-cross-go">See those tools →</span>
        </Link>
      </div>

      <div className="sol-wrap sol-close">
        <div className="sol-close-inner">
          <div>
            <h2>Put this profile on a number.</h2>
            <p>Same tools in the portal — pick ids, link a calendar, dial.</p>
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
