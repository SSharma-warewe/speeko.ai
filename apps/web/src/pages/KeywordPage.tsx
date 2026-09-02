import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
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
      <div className="sol-bar">
        <MarketingNav />
      </div>

      <header className="sol-wrap sol-mast">
        <p className="sol-kicker">{page.kicker}</p>
        <h1>{page.h1}</h1>
        <p className="sol-lead">{page.lead}</p>
        <ul className="sol-mast-chips" aria-label="Topics">
          {page.chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      </header>

      {page.sections.map((section, index) => (
        <section
          key={section.h2}
          className="sol-band"
          aria-labelledby={`kw-h-${index}`}
        >
          <div className="sol-wrap kw-section">
            <p className="sol-kicker">0{index + 1}</p>
            <h2 id={`kw-h-${index}`}>{section.h2}</h2>
            <div className="kw-copy">
              {section.body.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="sol-band" aria-labelledby="kw-faq-h">
        <div className="sol-wrap">
          <div className="sol-band-head">
            <p className="sol-kicker">FAQ</p>
            <h2 id="kw-faq-h">Questions we actually get.</h2>
          </div>
          <dl className="kw-faq">
            {page.faqs.map((faq) => (
              <div key={faq.q} className="kw-faq-item">
                <dt>{faq.q}</dt>
                <dd>{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="sol-band" aria-labelledby="kw-more-h">
        <div className="sol-wrap">
          <div className="sol-band-head">
            <p className="sol-kicker">Also</p>
            <h2 id="kw-more-h">Related pages.</h2>
          </div>
          <div className="sol-bento sol-bento--help">
            {page.related.map((item) => (
              <Link key={item.to} to={item.to} className="sol-bento-tile sol-help-card">
                <span className="sol-recipe-kind">{item.kicker}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="sol-wrap sol-band sol-band--last">
        <Link to={page.cross.to} className="sol-cross">
          <div>
            <p className="sol-kicker">{page.cross.kicker}</p>
            <h2>{page.cross.title}</h2>
            <p>{page.cross.body}</p>
          </div>
          <span className="sol-cross-go">Continue →</span>
        </Link>
      </div>

      <div className="sol-wrap sol-close">
        <div className="sol-close-inner">
          <div>
            <h2>{page.closeTitle}</h2>
            <p>{page.closeBody}</p>
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
