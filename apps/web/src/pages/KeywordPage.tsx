import { Link } from "react-router-dom";
import { Button, LiveDot } from "@call-agent/ui";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import { KEYWORD_PAGE_BY_PATH } from "../data/keyword-pages";
import type { KeywordPath } from "../data/marketing-routes";
import "./Solutions.css";
import "./KeywordPage.css";

export default function KeywordPage({ path }: { path: KeywordPath }) {
  const page = KEYWORD_PAGE_BY_PATH[path];

  return (
    <div className="sol-page kw-page">
      <div className="kw-cover">
        <div className="sol-bar">
          <MarketingNav />
        </div>

        <div className="kw-cover-grid">
          <header className="kw-cover-copy">
            <p className="kw-kicker kw-rise">{page.kicker}</p>
            <h1 className="kw-rise kw-rise-2">{page.h1}</h1>
            <p className="kw-dek kw-rise kw-rise-3">{page.dek}</p>
            <div className="kw-cover-actions kw-rise kw-rise-4">
              <Button as="a" href="/get-demo" variant="cta" size="lg" shine showArrow>
                Get a demo
              </Button>
              <Button as="a" href="/how-it-works" variant="ghostOnDark" size="lg">
                How it works
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

      <section className="kw-lede" aria-label="What this call finishes">
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

      <section className="kw-job" aria-labelledby="kw-job-h">
        <div className="kw-wrap kw-job-grid">
          <div className="kw-job-rail">
            <p className="kw-kicker">On the call</p>
            <h2 id="kw-job-h">The job, in order.</h2>
          </div>
          <ol className="kw-beats">
            {page.job.map((beat) => (
              <li key={beat.mark} className="kw-beat">
                <span className="kw-beat-mark">{beat.mark}</span>
                <div>
                  <h3>{beat.title}</h3>
                  <p>{beat.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="kw-contrast" aria-label="Contrast">
        <div className="kw-wrap kw-contrast-grid">
          <article className="kw-contrast-col is-left">
            <p className="kw-kicker">{page.contrast.leftTitle}</p>
            <p>{page.contrast.left}</p>
          </article>
          <article className="kw-contrast-col is-right">
            <p className="kw-kicker">{page.contrast.rightTitle}</p>
            <p>{page.contrast.right}</p>
          </article>
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

      <section className="kw-faq" aria-labelledby="kw-faq-h">
        <div className="kw-wrap">
          <p className="kw-kicker">FAQ</p>
          <h2 id="kw-faq-h">Questions we actually get.</h2>
          <div className="kw-faq-list">
            {page.faqs.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="kw-also" aria-labelledby="kw-also-h">
        <div className="kw-wrap">
          <p className="kw-kicker">Also</p>
          <h2 id="kw-also-h">Related pages.</h2>
          <ol className="kw-also-list">
            {page.related.map((item, index) => (
              <li key={item.to}>
                <Link to={item.to}>
                  <span className="kw-also-n">0{index + 1}</span>
                  <span className="kw-also-copy">
                    <strong>{item.title}</strong>
                    <em>{item.body}</em>
                  </span>
                  <span className="kw-also-go" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
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
