import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import {
  DELIVERY_MODES,
  HANGUP_SIDES,
  INTERRUPT_CARDS,
  PERSONA_ROWS,
  VOICE_DEFAULT_ID,
  VOICE_DEFAULT_RATE,
  VOICE_RATE_MAX,
  VOICE_RATE_MIN,
  VOICE_SAMPLE,
  VOICE_TALENT,
  VOICE_WALK,
  type DeliveryId,
} from "../data/voice";
import "./Solutions.css";
import "./HowItWorks.css";
import "./Voice.css";

export default function VoicePage() {
  const [voiceId, setVoiceId] = useState(VOICE_DEFAULT_ID);
  const [rate, setRate] = useState(VOICE_DEFAULT_RATE);
  const [delivery, setDelivery] = useState<DeliveryId>("BALANCED");

  const talent = useMemo(
    () => VOICE_TALENT.find((item) => item.id === voiceId) ?? VOICE_TALENT[0],
    [voiceId],
  );
  const ratePct = ((rate - VOICE_RATE_MIN) / (VOICE_RATE_MAX - VOICE_RATE_MIN)) * 100;

  return (
    <div className="sol-page voice-page">
      <div className="sol-bar">
        <MarketingNav />
      </div>

      <header className="sol-wrap sol-mast">
        <p className="sol-kicker">Voice</p>
        <h1>They hang up on robots.</h1>
        <p className="sol-lead">
          The first second decides the call. Flat IVR, wait-for-the-beep, metallic hold — people
          cut. Speeko agents open like a person: a voice you choose, a pace you set, and they
          listen when the other side talks over them.
        </p>
        <ul className="sol-mast-chips" aria-label="Voice controls">
          <li>Talent</li>
          <li>Pace</li>
          <li>Delivery</li>
          <li>Persona</li>
        </ul>
      </header>

      <section className="sol-band" aria-labelledby="voice-hangup-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">The hang-up</p>
              <h2 id="voice-hangup-h">They already know the machine.</h2>
            </div>
            <p className="sol-lead">
              A robotic voice is a courtesy hang-up. The line is gone before the menu starts.
            </p>
          </div>
          <div className="voice-contrast">
            {HANGUP_SIDES.map((side) => (
              <article
                key={side.id}
                className={`hiw-door${side.ink ? " is-ink" : ""}`}
              >
                <span className="sol-recipe-kind">{side.kicker}</span>
                <h3>{side.title}</h3>
                <ol>
                  {side.beats.map((beat) => (
                    <li key={beat}>{beat}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="voice-config-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Agent config</p>
              <h2 id="voice-config-h">Edit the voice on the agent.</h2>
            </div>
            <p className="sol-lead">
              Same desk as the system prompt. Persona is who it is. Voice is how it sounds. Next
              call uses what you saved.
            </p>
          </div>

          <div className="voice-studio">
            <div className="voice-studio-copy">
              <ol className="hiw-beats">
                {VOICE_WALK.map((beat, idx) => (
                  <li key={beat}>
                    <i aria-hidden>{String(idx + 1).padStart(2, "0")}</i>
                    {beat}
                  </li>
                ))}
              </ol>
              <p className="hiw-tools-note">
                Speed is how fast it talks. Delivery is how even vs. varied. Reply temperature on
                that pane is how the agent thinks — not how it sounds.
              </p>
            </div>

            <article className="hiw-desk" aria-label="Agent voice desk">
              <header className="hiw-desk-head">
                <span className="hiw-provider">Persona · Voice</span>
                <code>Voice</code>
              </header>
              <p className="hiw-host">After-hours desk</p>

              <div className="voice-talent" role="listbox" aria-label="Voice">
                {VOICE_TALENT.map((item) => {
                  const selected = item.id === talent.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`voice-tile${selected ? " is-on" : ""}`}
                      onClick={() => setVoiceId(item.id)}
                    >
                      <span className="voice-tile-mark" aria-hidden>
                        {item.initial}
                      </span>
                      <span className="voice-tile-copy">
                        <span className="voice-tile-name">{item.name}</span>
                        <span className="voice-tile-line">{item.line}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="hiw-voice">
                <div className="hiw-voice-row">
                  <span>Voice</span>
                  <strong>
                    {talent.name} · {talent.line}
                  </strong>
                </div>
                <div>
                  <div className="hiw-voice-row">
                    <label htmlFor="voice-speed">Speaking speed</label>
                    <strong>{rate.toFixed(2)}×</strong>
                  </div>
                  <input
                    id="voice-speed"
                    className="voice-speed"
                    type="range"
                    min={VOICE_RATE_MIN}
                    max={VOICE_RATE_MAX}
                    step={0.05}
                    value={rate}
                    aria-valuemin={VOICE_RATE_MIN}
                    aria-valuemax={VOICE_RATE_MAX}
                    aria-valuenow={rate}
                    aria-valuetext={`${rate.toFixed(2)} times native pace`}
                    style={{ ["--voice-rate" as string]: `${ratePct}%` }}
                    onChange={(event) => setRate(Number(event.target.value))}
                  />
                </div>
                <div className="hiw-voice-row">
                  <span>Delivery</span>
                  <div className="hiw-delivery" role="group" aria-label="Delivery">
                    {DELIVERY_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={delivery === mode.id ? "is-on" : undefined}
                        aria-pressed={delivery === mode.id}
                        title={mode.hint}
                        onClick={() => setDelivery(mode.id)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="voice-sample">
                  <span className="sol-recipe-kind">Now speaking</span>
                  {VOICE_SAMPLE}
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="voice-persona-h">
        <div className="sol-wrap">
          <div className="voice-persona">
            <div>
              <p className="sol-kicker">Persona</p>
              <h2 id="voice-persona-h">Voice is the instrument.</h2>
              <p className="sol-lead">
                Persona is who is holding it. Identity, tone, and the opening line live on the
                same agent — not inside the workflow.
              </p>
              <p className="hiw-tools-note">
                Write those prompts on{" "}
                <Link to="/how-it-works">How it works</Link>.
              </p>
            </div>
            <article className="hiw-desk" aria-label="Persona prompts">
              <dl className="hiw-script">
                {PERSONA_ROWS.map((row) => (
                  <div key={row.dt} className="hiw-script-row">
                    <dt>{row.dt}</dt>
                    <dd>{row.dd}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="voice-interrupt-h">
        <div className="sol-wrap">
          <div className="sol-band-head sol-band-head--row">
            <div>
              <p className="sol-kicker">Conversation</p>
              <h2 id="voice-interrupt-h">They can interrupt.</h2>
            </div>
            <p className="sol-lead">
              This is not a recording. If they talk, the agent stops. No beep. No menu tree.
            </p>
          </div>
          <div className="sol-bento sol-bento--kit">
            {INTERRUPT_CARDS.map((card) => (
              <article key={card.kicker} className="sol-bento-tile sol-fit-tile">
                <span className="sol-fit-step">{card.kicker}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="sol-wrap sol-band sol-band--last">
        <Link to="/how-it-works" className="sol-cross">
          <div>
            <p className="sol-kicker">Setup</p>
            <h2>From a number to a live agent.</h2>
            <p>
              Bring a virtual number, name the agents, switch on tools, and take the persona live
              — no code.
            </p>
          </div>
          <span className="sol-cross-go">See how it works →</span>
        </Link>
      </div>

      <div className="sol-wrap sol-close">
        <div className="sol-close-inner">
          <div>
            <h2>Hear it on a live number.</h2>
            <p>Bring a Telnyx or Twilio number. Leave with an agent people stay on.</p>
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
