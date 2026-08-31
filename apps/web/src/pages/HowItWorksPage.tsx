import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import { ToolIdChain } from "../components/ToolBench";
import { HOW_DOORS, HOW_PROFILE_IDS, HOW_STEPS, type HowStepId } from "../data/how-it-works";
import "./Solutions.css";
import "./HowItWorks.css";

export default function HowItWorksPage() {
  const [active, setActive] = useState<HowStepId>(HOW_STEPS[0].id);

  useEffect(() => {
    const nodes = HOW_STEPS.map((step) => document.getElementById(`hiw-${step.id}`)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target.id.replace(/^hiw-/, "") as HowStepId | undefined;
        if (id) setActive(id);
      },
      { rootMargin: "-28% 0px -48% 0px", threshold: [0.15, 0.35, 0.6] },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sol-page hiw-page">
      <div className="sol-bar">
        <MarketingNav />
      </div>

      <header className="sol-wrap sol-mast">
        <p className="sol-kicker">Setup</p>
        <h1>From a number to a live agent.</h1>
        <p className="sol-lead">
          You bring a virtual number from Telnyx, Twilio, or your SIP carrier. The portal connects
          it, names the agents, switches on tools, and takes the persona live — no code.
        </p>
        <div className="hiw-mast-row">
          <ul className="hiw-mast-chips" aria-label="Setup steps">
            {HOW_STEPS.map((step) => (
              <li key={step.id}>
                <a href={`#hiw-${step.id}`} className={active === step.id ? "is-active" : undefined}>
                  <em>{step.n}</em>
                  {step.kicker}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <div className="hiw-stage">
        <ol className="hiw-rail" aria-label="On this page">
          {HOW_STEPS.map((step) => (
            <li key={step.id}>
              <a
                href={`#hiw-${step.id}`}
                className={`hiw-rail-btn${active === step.id ? " is-active" : ""}`}
                aria-label={`${step.n} ${step.kicker}`}
                aria-current={active === step.id ? "location" : undefined}
              >
                <span className="hiw-rail-n">{step.n}</span>
                <span className="hiw-rail-label">{step.kicker}</span>
              </a>
            </li>
          ))}
        </ol>

        <div className="hiw-runway">
          {HOW_STEPS.filter((step) => step.id !== "live").map((step) => (
            <section
              key={step.id}
              id={`hiw-${step.id}`}
              className="hiw-step"
              aria-labelledby={`hiw-${step.id}-h`}
            >
              <div className="hiw-step-grid">
                <div className="hiw-copy">
                  <p className="sol-kicker">
                    <span className="hiw-n">{step.n}</span>
                    {step.kicker}
                  </p>
                  <h2 id={`hiw-${step.id}-h`}>{step.title}</h2>
                  <p className="sol-lead">{step.lead}</p>
                  <ol className="hiw-beats">
                    {step.beats.map((beat, idx) => (
                      <li key={beat}>
                        <i aria-hidden>{String(idx + 1).padStart(2, "0")}</i>
                        {beat}
                      </li>
                    ))}
                  </ol>
                  {step.id === "tools" ? (
                    <p className="hiw-tools-note">
                      The catalog of verbs lives on{" "}
                      <Link to="/solutions">Solutions</Link>. Talent, pace, and
                      delivery are on{" "}
                      <Link to="/voice">Voice</Link>.
                    </p>
                  ) : null}
                </div>
                <StepArtifact id={step.id} />
              </div>
            </section>
          ))}

          <LiveStep />
        </div>
      </div>

      <div className="sol-wrap sol-band sol-band--last">
        <Link to="/solutions" className="sol-cross">
          <div>
            <p className="sol-kicker">Tools</p>
            <h2>The verbs on the call.</h2>
            <p>
              Hang up, look someone up, check a calendar, book, cancel, transfer. Assemble a
              profile — you do not upload code.
            </p>
          </div>
          <span className="sol-cross-go">See the catalog →</span>
        </Link>
      </div>

      <div className="sol-wrap sol-close">
        <div className="sol-close-inner">
          <div>
            <h2>Try it on a live number.</h2>
            <p>Bring a Telnyx or Twilio number. Leave with an agent that can act.</p>
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

function LiveStep() {
  const step = HOW_STEPS.find((item) => item.id === "live")!;

  return (
    <section id="hiw-live" className="hiw-step" aria-labelledby="hiw-live-h">
      <div className="hiw-copy hiw-live-head">
        <p className="sol-kicker">
          <span className="hiw-n">{step.n}</span>
          {step.kicker}
        </p>
        <h2 id="hiw-live-h">{step.title}</h2>
        <p className="sol-lead">{step.lead}</p>
      </div>
      <div className="hiw-doors">
        {HOW_DOORS.map((door) => (
          <article
            key={door.id}
            className={`hiw-door${door.id === "dispatch" ? " is-ink" : ""}`}
          >
            <span className="sol-recipe-kind">{door.kicker}</span>
            <h3>{door.title}</h3>
            <p>{door.body}</p>
            <ol>
              {door.beats.map((beat) => (
                <li key={beat}>{beat}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

function StepArtifact({ id }: { id: HowStepId }) {
  if (id === "number") {
    return (
      <article className="hiw-desk" aria-label="Virtual number connected">
        <header className="hiw-desk-head">
          <span className="hiw-provider">Telnyx · Twilio</span>
          <code>+1 415 555 0199</code>
        </header>
        <p className="hiw-host">sip.telnyx.com</p>
        <div className="hiw-rails">
          <div className="hiw-rail-card">
            <header>
              <strong>Outbound</strong>
              <span className="hiw-pill is-live">Live</span>
            </header>
            <p>Provision with the provider address. Live on create.</p>
          </div>
          <div className="hiw-rail-card">
            <header>
              <strong>Inbound</strong>
              <span className="hiw-pill is-draft">Draft</span>
            </header>
            <p>Publish, then point the provider at Speeko.</p>
          </div>
        </div>
      </article>
    );
  }

  if (id === "agents") {
    return (
      <div className="hiw-agent-pair">
        <article className="hiw-agent is-ink">
          <span className="sol-recipe-kind">Inbound</span>
          <h3>After-hours desk</h3>
          <p>Default task required — what a ring is for.</p>
          <p className="hiw-agent-meta">confirm the visit</p>
        </article>
        <article className="hiw-agent">
          <span className="sol-recipe-kind">Outbound</span>
          <h3>Tomorrow’s list</h3>
          <p>No task on the agent. Set it on the call, the batch, or the CRM endpoint.</p>
          <p className="hiw-agent-meta">Ashley · Balanced</p>
        </article>
      </div>
    );
  }

  if (id === "tools") {
    return (
      <article className="hiw-desk hiw-tools-desk" aria-label="Tool profile and voice">
        <p className="sol-kicker">Profile</p>
        <ToolIdChain ids={HOW_PROFILE_IDS} />
        <div className="hiw-voice">
          <div className="hiw-voice-row">
            <span>Voice</span>
            <strong>Ashley · Warm American</strong>
          </div>
          <div>
            <div className="hiw-voice-row">
              <span>Speaking speed</span>
              <strong>1.0×</strong>
            </div>
            <div className="hiw-speed" aria-hidden>
              <i />
            </div>
          </div>
          <div className="hiw-voice-row">
            <span>Delivery</span>
            <div className="hiw-delivery" aria-label="Delivery Balanced">
              <span>Stable</span>
              <span className="is-on">Balanced</span>
              <span>Creative</span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (id === "persona") {
    return (
      <article className="hiw-desk" aria-label="Persona prompts">
        <dl className="hiw-script">
          <div className="hiw-script-row">
            <dt>System prompt</dt>
            <dd>You are the clinic’s after-hours desk. Warm, brief, never invent a slot.</dd>
          </div>
          <div className="hiw-script-row">
            <dt>On start</dt>
            <dd>Greet by name. Offer the listed visit. Empty = built-in greeting.</dd>
          </div>
          <div className="hiw-script-row">
            <dt>On end</dt>
            <dd>We’ll see you then. Spoken as written — or silent.</dd>
          </div>
        </dl>
      </article>
    );
  }

  return null;
}
