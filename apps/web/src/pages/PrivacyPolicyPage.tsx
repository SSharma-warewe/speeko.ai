import { useEffect, useState } from "react";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import { privacyArticleHtml } from "../data/privacy-document";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "../data/privacy";
import "./Privacy.css";
import "./Solutions.css";

export default function PrivacyPolicyPage() {
  const [active, setActive] = useState<string>(PRIVACY_SECTIONS[0].id);

  useEffect(() => {
    const nodes = PRIVACY_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (nodes.length === 0) return;

    const mark = () => {
      const line = 96;
      let current = nodes[0].id;
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= line) current = node.id;
      }
      setActive(current);
    };

    mark();
    window.addEventListener("scroll", mark, { passive: true });
    return () => window.removeEventListener("scroll", mark);
  }, []);

  return (
    <div className="sol-page pp-page">
      <div className="sol-bar">
        <MarketingNav />
      </div>

      <header className="sol-wrap pp-mast">
        <p className="sol-kicker">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="pp-updated">Last updated {PRIVACY_UPDATED}</p>
        <p className="pp-lead">
          Speeko AI (“Speeko”, “we”, “our”, or “us”) provides AI voice agents and messaging
          automation for businesses. This policy explains how we collect, use, store, and protect
          information when you use our website, portal, APIs, and integrations, including Meta
          WhatsApp.
        </p>
      </header>

      <div className="sol-wrap pp-layout">
        <nav className="pp-toc" aria-label="On this page">
          <p className="pp-toc-title">On this page</p>
          <ol>
            {PRIVACY_SECTIONS.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={active === section.id ? "is-active" : undefined}
                  aria-current={active === section.id ? "location" : undefined}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article
          className="pp-doc"
          dangerouslySetInnerHTML={{ __html: privacyArticleHtml() }}
        />
      </div>

      <MarketingFooter />
    </div>
  );
}
