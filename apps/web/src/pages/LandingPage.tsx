import { useMemo, useState } from "react";
import { Button, Eyebrow, LiveDot, WaveIndicator } from "@call-agent/ui";
import IntegrationsBubble from "../components/IntegrationsBubble";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNav from "../components/MarketingNav";
import WavesHero from "../components/WavesHero";
import "./LandingPage.css";

type DemoView = "overview" | "history" | "stats";
type DemoHistoryFilter =
  | "all"
  | "confirmed"
  | "declined"
  | "rescheduled"
  | "abandoned"
  | "no_answer";

const DEMO_HISTORY = [
  {
    id: "1",
    name: "Elena Vasquez",
    doctor: "Dr. Patel · Jul 15 at 9:30 AM",
    when: "Jul 14, 10:42 AM",
    relative: "2h ago",
    outcome: "Confirmed",
    tone: "confirmed" as const,
    preview: "Agent: I'll mark you confirmed. · Caller: Perfect, thank you.",
    duration: "3m 48s",
    segments: 12,
  },
  {
    id: "2",
    name: "James Okonkwo",
    doctor: "Dr. Nguyen · Jul 15 at 10:15 AM",
    when: "Jul 14, 10:18 AM",
    relative: "3h ago",
    outcome: "Rescheduled",
    tone: "rescheduled" as const,
    preview: "Caller: Can we do Thursday instead? · Agent: Thursday at 2 works.",
    duration: "5m 02s",
    segments: 18,
  },
  {
    id: "3",
    name: "Sofia Chen",
    doctor: "Dr. Patel · Jul 15 at 11:00 AM",
    when: "Jul 14, 9:55 AM",
    relative: "3h ago",
    outcome: "No answer",
    tone: "no_answer" as const,
    preview: "No transcript recorded",
    duration: "0m 42s",
    segments: 0,
  },
  {
    id: "4",
    name: "Marcus Hale",
    doctor: "Dr. Rivera · Jul 15 at 1:45 PM",
    when: "Jul 14, 9:21 AM",
    relative: "4h ago",
    outcome: "Declined",
    tone: "declined" as const,
    preview: "Caller: I need to cancel that visit. · Agent: I've marked it canceled.",
    duration: "2m 11s",
    segments: 8,
  },
  {
    id: "5",
    name: "Priya Shah",
    doctor: "Dr. Nguyen · Jul 16 at 8:00 AM",
    when: "Jul 13, 4:12 PM",
    relative: "1d ago",
    outcome: "Confirmed",
    tone: "confirmed" as const,
    preview: "Agent: See you tomorrow at 8. · Caller: Sounds good.",
    duration: "2m 54s",
    segments: 9,
  },
  {
    id: "6",
    name: "Noah Kim",
    doctor: "Dr. Patel · Jul 16 at 9:15 AM",
    when: "Jul 13, 3:40 PM",
    relative: "1d ago",
    outcome: "Abandoned",
    tone: "abandoned" as const,
    preview: "Agent: Hello, this is Speeko calling from… · (call ended)",
    duration: "0m 18s",
    segments: 2,
  },
];

const HISTORY_FILTERS: { id: DemoHistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "declined", label: "Declined" },
  { id: "rescheduled", label: "Rescheduled" },
  { id: "abandoned", label: "Abandoned" },
  { id: "no_answer", label: "No answer" },
];

export default function LandingPage() {
  const [demoView, setDemoView] = useState<DemoView>("overview");
  const [historyFilter, setHistoryFilter] = useState<DemoHistoryFilter>("all");

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return DEMO_HISTORY;
    return DEMO_HISTORY.filter((row) => row.tone === historyFilter);
  }, [historyFilter]);

  const historyCounts = useMemo(() => {
    const counts: Record<DemoHistoryFilter, number> = {
      all: DEMO_HISTORY.length,
      confirmed: 0,
      declined: 0,
      rescheduled: 0,
      abandoned: 0,
      no_answer: 0,
    };
    for (const row of DEMO_HISTORY) {
      counts[row.tone] += 1;
    }
    return counts;
  }, []);

  return (
    <div className="lp-root" style={{ background: "#f0eee9", minHeight: "100vh", fontFamily: "var(--font-body)" }}>
      <WavesHero>
        <MarketingNav />
        <div className="lp-hero-content">
          <p className="lp-hero-eyebrow">Inbound + outbound voice agents</p>
          <h1 className="lp-hero-title">Voice agents that pick up the phone for you.</h1>
          <p className="lp-hero-lead">
            Speeko places and answers calls for appointment confirmations and lead outreach — with live
            transcripts, real-time outcomes, and zero missed follow-ups.
          </p>
          <div className="lp-hero-actions">
            <Button as="a" href="/get-demo" variant="cta" size="lg" shine showArrow>
              Get a demo
            </Button>
            <Button as="a" href="/how-it-works" variant="ghostOnDark" size="lg">
              See how it works
            </Button>
          </div>
        </div>
      </WavesHero>

      {/* DEMO DASHBOARD — mirrors real confirmation overview */}
      <section id="demo" className="lp-demo" aria-labelledby="lp-demo-heading">
        <div className="lp-demo-header">
          <div className="lp-demo-header-copy">
            <Eyebrow>Dashboard</Eyebrow>
            <h2 id="lp-demo-heading" className="lp-section-title">
              Your ops desk for every call.
            </h2>
            <p className="lp-section-lead">
              The same workspace your team uses daily — open the next room, join live, and track
              outcomes without leaving the page.
            </p>
          </div>
          <ul className="lp-demo-pills" aria-label="Dashboard highlights">
            {(
              [
                { t: "Overview", d: "Queue + live join", view: "overview" as const },
                { t: "Call history", d: "Transcripts & outcomes", view: "history" as const },
                { t: "Agent stats", d: "Pipeline & charts", view: "stats" as const },
              ] as const
            ).map((p) => (
              <li key={p.t}>
                <button
                  type="button"
                  className={`lp-demo-pill-btn${demoView === p.view ? " is-active" : ""}`}
                  onClick={() => setDemoView(p.view)}
                >
                  <strong>{p.t}</strong>
                  <span>{p.d}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-demo-stage">
          <div
            className="lp-demo-window"
            aria-label="Interactive Speeko dashboard preview"
          >
            <div className="lp-demo-chrome">
              <div className="lp-demo-dots" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <div className="lp-demo-url">
                localhost:5173 / agents / appointment-confirmation
                {demoView === "history"
                  ? " · history"
                  : demoView === "stats"
                    ? " · stats"
                    : ""}
              </div>
              <span className="lp-demo-live-chip">
                <LiveDot />
                Live
              </span>
            </div>

            <div className="lp-demo-shell">
              <aside className="lp-demo-sidebar">
                <div className="lp-demo-side-brand">
                  <span className="lp-demo-back">← All agents</span>
                  <p className="lp-demo-side-eyebrow">Outbound confirmations</p>
                  <h3 className="lp-demo-side-title">Appointment Confirmation</h3>
                </div>
                <nav className="lp-demo-side-nav" aria-label="Demo dashboard sections">
                  {(
                    [
                      {
                        id: "overview" as const,
                        label: "Overview",
                        desc: "Live metrics & queue",
                      },
                      {
                        id: "history" as const,
                        label: "Call history",
                        desc: "Completed calls",
                      },
                      {
                        id: "stats" as const,
                        label: "Agent stats",
                        desc: "Outcomes & pipeline",
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`lp-demo-side-link${demoView === item.id ? " is-active" : ""}`}
                      aria-current={demoView === item.id ? "page" : undefined}
                      onClick={() => setDemoView(item.id)}
                    >
                      <span className="lp-demo-side-link-label">{item.label}</span>
                      <span className="lp-demo-side-link-desc">{item.desc}</span>
                    </button>
                  ))}
                </nav>
                <div className="lp-demo-side-foot">
                  <span className="lp-demo-live-chip">
                    <LiveDot />
                    Live
                  </span>
                  <span className="lp-demo-refresh">Updated 11:16:04 AM</span>
                </div>
              </aside>

              <div className="lp-demo-content" key={demoView}>
                {demoView === "overview" && (
                  <>
                    <header className="lp-demo-page-header">
                      <h3>Appointment Confirmation</h3>
                      <p>
                        Open the next call, Join within 5 minutes — unanswered calls return to the
                        end of the line.
                      </p>
                    </header>

                    <div className="lp-demo-queue-control">
                      <div className="lp-demo-panel-head">
                        <h4>Queue control</h4>
                      </div>
                      <p className="lp-demo-muted">
                        Opens the next pending appointment room (one at a time). Disabled while a
                        room is waiting or a call is active.
                      </p>
                      <button type="button" className="lp-demo-primary-btn" tabIndex={-1}>
                        Open next call
                      </button>
                    </div>

                    <div className="lp-demo-kpis">
                      {[
                        { value: "3", label: "Agents", hint: "1 room ready", highlight: false },
                        { value: "142", label: "Total calls", hint: "18 today", highlight: false },
                        {
                          value: "96",
                          label: "Calls answered",
                          hint: "87% confirmed",
                          highlight: true,
                        },
                        {
                          value: "9h 24m",
                          label: "Call time",
                          hint: "Avg 4m 12s",
                          highlight: false,
                        },
                      ].map((kpi) => (
                        <article
                          key={kpi.label}
                          className={`lp-demo-kpi${kpi.highlight ? " is-highlight" : ""}`}
                        >
                          <span className="lp-demo-kpi-value">{kpi.value}</span>
                          <span className="lp-demo-kpi-label">{kpi.label}</span>
                          <span className="lp-demo-kpi-hint">{kpi.hint}</span>
                        </article>
                      ))}
                    </div>

                    <div className="lp-demo-columns">
                      <section className="lp-demo-panel">
                        <div className="lp-demo-panel-head">
                          <h4>Join active calls</h4>
                          <span className="lp-demo-count">1 available</span>
                        </div>
                        <div className="lp-demo-call-card">
                          <div className="lp-demo-call-body">
                            <div className="lp-demo-call-top">
                              <strong>Elena Vasquez</strong>
                              <WaveIndicator bars={4} />
                            </div>
                            <p>Dr. Patel · Jul 15 at 9:30 AM</p>
                            <p className="lp-demo-mono">Room conf-elena-vasquez-091</p>
                          </div>
                          <div className="lp-demo-call-actions">
                            <span className="lp-demo-pill is-calling">Ready to join</span>
                            <button type="button" className="lp-demo-join-btn" tabIndex={-1}>
                              Join call
                            </button>
                          </div>
                        </div>
                      </section>

                      <section className="lp-demo-panel">
                        <div className="lp-demo-panel-head">
                          <h4>Pending queue</h4>
                          <span className="lp-demo-count">3 waiting</span>
                        </div>
                        <ul className="lp-demo-pending">
                          {[
                            { name: "James Okonkwo", meta: "+1 (415) 555-0142", status: "PENDING" },
                            { name: "Sofia Chen", meta: "+1 (628) 555-0198", status: "PENDING" },
                            { name: "Marcus Hale", meta: "+1 (510) 555-0177", status: "PENDING" },
                          ].map((row) => (
                            <li key={row.name} className="lp-demo-pending-item">
                              <div>
                                <strong>{row.name}</strong>
                                <p>{row.meta}</p>
                              </div>
                              <span className="lp-demo-pill is-pending">{row.status}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  </>
                )}

                {demoView === "history" && (
                  <>
                    <header className="lp-demo-page-header">
                      <h3>Call history</h3>
                      <p>
                        Browse completed calls, transcripts, and outcomes for this agent.
                      </p>
                    </header>

                    <section className="lp-demo-panel lp-demo-history-panel">
                      <div className="lp-demo-panel-head">
                        <h4>All calls</h4>
                        <span className="lp-demo-count">{DEMO_HISTORY.length} completed</span>
                      </div>

                      <div
                        className="lp-demo-filters"
                        role="tablist"
                        aria-label="Filter call history"
                      >
                        {HISTORY_FILTERS.map((filter) => (
                          <button
                            key={filter.id}
                            type="button"
                            role="tab"
                            aria-selected={historyFilter === filter.id}
                            className={`lp-demo-filter${historyFilter === filter.id ? " is-active" : ""}`}
                            onClick={() => setHistoryFilter(filter.id)}
                          >
                            {filter.label}
                            <span className="lp-demo-filter-count">
                              {historyCounts[filter.id]}
                            </span>
                          </button>
                        ))}
                      </div>

                      {filteredHistory.length === 0 ? (
                        <p className="lp-demo-empty">
                          No {HISTORY_FILTERS.find((f) => f.id === historyFilter)?.label.toLowerCase()}{" "}
                          calls.
                        </p>
                      ) : (
                        <ul className="lp-demo-history-list">
                          {filteredHistory.map((row) => (
                            <li key={row.id} className="lp-demo-history-card">
                              <div className="lp-demo-history-top">
                                <strong>{row.name}</strong>
                                <time>
                                  {row.when}
                                  <span className="lp-demo-history-rel"> · {row.relative}</span>
                                </time>
                              </div>
                              <p className="lp-demo-history-sub">{row.doctor}</p>
                              <p className="lp-demo-history-preview">{row.preview}</p>
                              <div className="lp-demo-history-tags">
                                <span className={`lp-demo-pill is-${row.tone}`}>{row.outcome}</span>
                                <span className="lp-demo-tag-meta">{row.duration}</span>
                                <span className="lp-demo-tag-meta">
                                  {row.segments} transcript segments
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}

                {demoView === "stats" && (
                  <>
                    <header className="lp-demo-page-header">
                      <h3>Agent stats</h3>
                      <p>Pipeline distribution, outcome breakdown, and recent activity.</p>
                    </header>

                    <div className="lp-demo-stats-summary">
                      {[
                        { value: "28", label: "Appointments" },
                        { value: "142", label: "Calls logged" },
                        { value: "118", label: "With transcript" },
                        { value: "2h ago", label: "Last call" },
                      ].map((item) => (
                        <div key={item.label} className="lp-demo-stats-item">
                          <span className="lp-demo-stats-value">{item.value}</span>
                          <span className="lp-demo-stats-label">{item.label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="lp-demo-columns">
                      <section className="lp-demo-panel">
                        <div className="lp-demo-panel-head">
                          <h4>Appointment pipeline</h4>
                          <span className="lp-demo-count">28 total</span>
                        </div>
                        <div
                          className="lp-demo-pipeline-bar"
                          role="img"
                          aria-label="Appointment status distribution"
                        >
                          <div className="lp-demo-seg is-pending" style={{ flexGrow: 8 }} title="Pending: 8" />
                          <div className="lp-demo-seg is-calling" style={{ flexGrow: 1 }} title="Calling: 1" />
                          <div className="lp-demo-seg is-confirmed" style={{ flexGrow: 14 }} title="Confirmed: 14" />
                          <div className="lp-demo-seg is-declined" style={{ flexGrow: 2 }} title="Canceled: 2" />
                          <div className="lp-demo-seg is-rescheduled" style={{ flexGrow: 2 }} title="Rescheduled: 2" />
                          <div className="lp-demo-seg is-abandoned" style={{ flexGrow: 1 }} title="Abandoned: 1" />
                        </div>
                        <ul className="lp-demo-pipeline-legend">
                          {[
                            { label: "Pending", count: 8, tone: "pending" },
                            { label: "Calling", count: 1, tone: "calling" },
                            { label: "Confirmed", count: 14, tone: "confirmed" },
                            { label: "Canceled", count: 2, tone: "declined" },
                            { label: "Rescheduled", count: 2, tone: "rescheduled" },
                            { label: "Abandoned", count: 1, tone: "abandoned" },
                          ].map((seg) => (
                            <li key={seg.label}>
                              <span className={`lp-demo-pipeline-dot is-${seg.tone}`} />
                              <span>{seg.label}</span>
                              <strong>{seg.count}</strong>
                            </li>
                          ))}
                        </ul>
                      </section>

                      <section className="lp-demo-panel">
                        <div className="lp-demo-panel-head">
                          <h4>Call outcomes</h4>
                          <span className="lp-demo-count">142 calls</span>
                        </div>
                        <ul className="lp-demo-outcome-chart">
                          {[
                            { label: "Confirmed", count: 84, tone: "confirmed", pct: 100 },
                            { label: "No answer", count: 22, tone: "no_answer", pct: 26 },
                            { label: "Rescheduled", count: 14, tone: "rescheduled", pct: 17 },
                            { label: "Declined", count: 11, tone: "declined", pct: 13 },
                            { label: "Abandoned", count: 7, tone: "abandoned", pct: 8 },
                            { label: "Failed", count: 4, tone: "failed", pct: 5 },
                          ].map((row) => (
                            <li key={row.label} className="lp-demo-outcome-row">
                              <span className="lp-demo-outcome-label">{row.label}</span>
                              <div className="lp-demo-outcome-track">
                                <div
                                  className={`lp-demo-outcome-fill is-${row.tone}`}
                                  style={{ width: `${row.pct}%` }}
                                />
                              </div>
                              <span className="lp-demo-outcome-count">{row.count}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>

                    <section className="lp-demo-panel lp-demo-activity-panel">
                      <div className="lp-demo-panel-head">
                        <h4>Recent activity</h4>
                        <span className="lp-demo-count">Last 5 calls</span>
                      </div>
                      <ol className="lp-demo-activity">
                        {DEMO_HISTORY.slice(0, 5).map((row) => (
                          <li key={row.id} className="lp-demo-activity-item">
                            <span className="lp-demo-activity-time">{row.when.split(", ")[1]}</span>
                            <span className={`lp-demo-activity-dot is-${row.tone}`} />
                            <div className="lp-demo-activity-body">
                              <strong>{row.name}</strong>
                              <span>
                                {row.outcome} · {row.duration}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </>
                )}
              </div>
            </div>
          </div>
          <p className="lp-demo-hint">
            Click <strong>Overview</strong>, <strong>Call history</strong>, or{" "}
            <strong>Agent stats</strong> in the sidebar to explore the demo.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <div id="how" style={{ padding: "72px 56px", background: "#ffffff" }}>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          How it works
        </p>
        <h2
          style={{
            margin: "0 0 44px",
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 700,
            color: "#0a0a0a",
            maxWidth: 640,
          }}
        >
          One platform, two directions of calling.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Outbound */}
          <div className="lp-card" style={{ padding: "28px 30px", borderRadius: 12, background: "#fafafa" }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#1e3a5f",
                background: "#eef2f7",
                border: "1px solid #cbd8e6",
                padding: "4px 10px",
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              Outbound
            </span>
            <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)", fontSize: 20, color: "#0a0a0a" }}>
              Your agent calls them
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#525252" }}>
              Example: a clinic needs to confirm tomorrow’s appointments. The system queues each patient and the
              AI agent dials out — so staff don’t have to work a phone list by hand.
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {[
                "You add people or jobs to an outbound queue",
                "The agent dials each number automatically",
                "It runs your script (confirm, book, follow up, etc.)",
                "Outcome + transcript land on your dashboard",
              ].map((step, idx) => (
                <li key={idx} style={{ display: "flex", gap: 10, fontSize: 13.5, color: "#525252" }}>
                  <span style={{ fontWeight: 700, color: "#0a0a0a" }}>{String(idx + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Inbound */}
          <div className="lp-card" style={{ padding: "28px 30px", borderRadius: 12, background: "#fafafa" }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#1e3a5f",
                background: "#eef2f7",
                border: "1px solid #cbd8e6",
                padding: "4px 10px",
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              Inbound
            </span>
            <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)", fontSize: 20, color: "#0a0a0a" }}>
              They call your agent
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#525252" }}>
              Example: a patient calls the clinic number. The AI answers immediately, greets them, and helps book
              a new visit — no hold music, no missed after-hours calls.
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {[
                "Someone dials your number (or starts a demo call)",
                "The agent answers and greets the caller",
                "It handles the request (e.g. book an appointment)",
                "Call log + result sync to your dashboard",
              ].map((step, idx) => (
                <li key={idx} style={{ display: "flex", gap: 10, fontSize: 13.5, color: "#525252" }}>
                  <span style={{ fontWeight: 700, color: "#0a0a0a" }}>{String(idx + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <p className="lp-how-more">
          <a href="/how-it-works">Walk the setup — number, agents, tools, live →</a>
        </p>
      </div>

      {/* AGENT INTEGRATIONS (Bubble UI) */}
      <IntegrationsBubble />

      {/* FAQ */}
      <section id="faq" className="lp-faq-section" aria-labelledby="lp-faq-heading">
        <div className="lp-faq-layout">
          <div className="lp-faq-aside">
            <Eyebrow>FAQ</Eyebrow>
            <h2 id="lp-faq-heading" className="lp-section-title">
              Answers before you dial in.
            </h2>
            <p className="lp-section-lead">
              Straight talk on setup, scale, security, and whether Speeko fits a one-location
              shop or a national queue.
            </p>
            <div className="lp-faq-trust">
              {["HIPAA-ready", "SOC 2 Type II", "Encrypted transcripts"].map((badge) => (
                <span key={badge} className="lp-faq-trust-badge">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="lp-faq-list">
            {[
              {
                q: "Do I need any technical setup to get started?",
                a: "No. Connect your appointment system or upload a lead list, choose a script, and your agent is live — no code required. Most teams are placing their first real call the same day.",
              },
              {
                q: "Can it handle high call volumes for large teams?",
                a: "Yes. The same setup scales from a single-location practice to a national call center running thousands of calls a day, with queue locks so agents claim one call at a time.",
              },
              {
                q: "Is customer and patient data secure?",
                a: "Calls and transcripts are encrypted in transit and at rest. The platform is built to HIPAA-ready and SOC 2 Type II standards for regulated industries.",
              },
              {
                q: "Does this work for a single small business?",
                a: "Yes — many customers run just one agent for one location, and can add more agents, queues, and integrations as they grow.",
              },
              {
                q: "Can I listen in or join a live call?",
                a: "When a room is open, join from the dashboard in one click. Every finished call keeps a full transcript and outcome so nothing is a black box.",
              },
            ].map((item, idx) => (
              <details key={item.q} className="lp-faq" style={{ animationDelay: `${idx * 0.04}s` }}>
                <summary className="lp-faq-summary">
                  <span className="lp-faq-index" aria-hidden>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="lp-faq-q">{item.q}</span>
                  <span className="lp-faq-icon" aria-hidden />
                </summary>
                <div className="lp-faq-body-wrap">
                  <p className="lp-faq-body">{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA — simple yellow band (original layout) */}
      <section className="lp-cta" aria-labelledby="lp-cta-heading">
        <h2 id="lp-cta-heading">Ready to stop missing calls?</h2>
        <p>Set up your first agent in minutes — no code required.</p>
        <Button as="a" href="/get-demo" variant="ctaDark" size="lg" showArrow>
          Get a demo
        </Button>
      </section>

      <MarketingFooter />
    </div>
  );
}
