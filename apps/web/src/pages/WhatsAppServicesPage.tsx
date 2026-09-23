import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import "./KeywordPage.css";
import "./Solutions.css";

const CATEGORIES = [
  {
    kicker: "Marketing",
    title: "Open a thread they did not start",
    body: "Offers, announcements, re-engagement. Meta only sends these as approved templates. Pacing and per-user limits apply before a blast goes out.",
  },
  {
    kicker: "Utility",
    title: "Follow a request they already made",
    body: "A delivery, a payment, a moved visit. Not a promotion. This is the template you send when the update is theirs.",
  },
  {
    kicker: "Authentication",
    title: "A one-time code",
    body: "Login and verification. Speeko’s get-demo form already sends this kind of code on WhatsApp before a call is queued.",
  },
  {
    kicker: "Service",
    title: "Reply while the window is open",
    body: "They messaged or called you. For 24 hours you can answer in ordinary language. Each new message or call from them resets the timer.",
  },
] as const;

const IN_WINDOW = [
  "Text",
  "Image",
  "Video",
  "Audio",
  "Document",
  "Buttons",
  "Lists",
  "Flows",
  "Location",
];

const FAQS = [
  {
    q: "When can we reply in ordinary language?",
    a: "After a WhatsApp user messages you or calls you. That opens a 24-hour customer service window. If they message or call again before it expires, the timer resets. Inside it, service messages do not need template approval.",
  },
  {
    q: "What if the window is closed?",
    a: "Only an approved template can start the thread again. Meta’s categories are marketing, utility, and authentication. A free-form “just checking in” is not allowed.",
  },
  {
    q: "Do you add a fee on top of Meta?",
    a: "This page does not publish Meta’s rate card and does not add a Speeko markup. Meta charges by message category and market. Service replies inside the open window are Meta’s customer-care category.",
  },
  {
    q: "Is this the voice agent?",
    a: "No. Calling agents place and answer phone calls. WhatsApp is a separate thread: templates when you start it, a reply while they have it open. The same desk can use both.",
  },
] as const;

export default function WhatsAppServicesPage() {
  return (
    <div className="sol-page kw-page">
      <div className="kw-cover">
        <div className="sol-bar">
          <MarketingNav />
        </div>

        <div className="kw-cover-grid">
          <header className="kw-cover-copy">
            <p className="kw-kicker kw-rise">WhatsApp services</p>
            <h1 className="kw-rise kw-rise-2">The thread, on Meta’s clock.</h1>
            <p className="kw-dek kw-rise kw-rise-3">
              A person messages you and a 24-hour window opens. Inside it, you reply.
              Outside it, only an approved template can speak.
            </p>
            <div className="kw-cover-actions kw-rise kw-rise-4">
              <Button as="a" href="/get-demo" variant="cta" size="lg" shine showArrow>
                Get a demo
              </Button>
              <Button
                as="a"
                href="/solutions/ai-calling-agents"
                variant="ghostOnDark"
                size="lg"
              >
                AI calling agents
              </Button>
            </div>
            <ul className="kw-ticks kw-rise kw-rise-5" aria-label="WhatsApp rules">
              <li>Templates</li>
              <li>24-hour window</li>
              <li>Service replies</li>
              <li>Cloud API</li>
            </ul>
          </header>

          <aside className="wa-thread kw-rise kw-rise-3" aria-label="Example WhatsApp thread">
            <p className="wa-thread-who">Priya Shah · WhatsApp</p>
            <div className="wa-bubble is-in">
              <p>Can I move Thursday?</p>
              <span>They wrote</span>
            </div>
            <p className="wa-window">24-hour window open</p>
            <div className="wa-bubble is-out">
              <p>Thursday 2:00 is open. Want me to move it?</p>
              <span>Service reply</span>
            </div>
            <p className="wa-window is-shut">Later, the window closes. A template is the only way back in.</p>
          </aside>
        </div>
      </div>

      <section className="sol-jobs" aria-labelledby="wa-cat-h">
        <div className="kw-wrap">
          <p className="kw-kicker">Categories</p>
          <h2 id="wa-cat-h">Four kinds of message. Meta picks the rules.</h2>
          <div className="sol-job-grid sol-job-grid--four">
            {CATEGORIES.map((item) => (
              <article key={item.kicker} className="sol-job-tile">
                <span className="kw-kicker">{item.kicker}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="wa-window-band" aria-labelledby="wa-window-h">
        <div className="kw-wrap wa-window-grid">
          <div>
            <p className="kw-kicker">Inside the window</p>
            <h2 id="wa-window-h">Free-form, until the day is up.</h2>
            <p>
              Text, media, buttons, lists, Flows, and location. No template review for that
              reply. When the 24 hours end, those shapes stop and the template list is all
              that remains.
            </p>
          </div>
          <ul className="wa-kinds" aria-label="Service message types">
            {IN_WINDOW.map((kind) => (
              <li key={kind}>{kind}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="kw-live" aria-labelledby="wa-speeko-h">
        <div className="kw-wrap kw-live-row">
          <div>
            <p className="kw-kicker">On Speeko today</p>
            <h2 id="wa-speeko-h">A code, and the webhook Meta asks for.</h2>
            <p className="kw-live-body">
              Get a demo sends an authentication code on WhatsApp, then queues the call.
              In the portal, Integrations → WhatsApp generates the callback URL and verify
              token. Inbound events are stored. There is no template editor on this page.
            </p>
          </div>
          <Link to="/get-demo" className="kw-live-go">
            Request a demo →
          </Link>
        </div>
      </section>

      <section className="kw-faq" aria-labelledby="wa-faq-h">
        <div className="kw-wrap">
          <p className="kw-kicker">FAQ</p>
          <h2 id="wa-faq-h">The rules, in short.</h2>
          <div className="kw-faq-list">
            {FAQS.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="kw-also" aria-labelledby="wa-also-h">
        <div className="kw-wrap">
          <p className="kw-kicker">Also</p>
          <h2 id="wa-also-h">The phone, if the thread is the wrong room.</h2>
          <ol className="kw-also-list">
            <li>
              <Link to="/solutions/ai-calling-agents">
                <span className="kw-also-n">01</span>
                <span className="kw-also-copy">
                  <strong>AI calling agents</strong>
                  <em>Inbound and outbound calls that write the outcome.</em>
                </span>
                <span className="kw-also-go" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          </ol>
        </div>
      </section>

      <section className="kw-close">
        <div className="kw-wrap kw-close-inner">
          <div>
            <h2>See both on a live number.</h2>
            <p>A WhatsApp code to start, then a call that can finish the job.</p>
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
