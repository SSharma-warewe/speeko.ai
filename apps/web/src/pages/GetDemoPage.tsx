import { useState } from "react";
import { Link } from "react-router-dom";
import "./GetDemoPage.css";

/** Keep in sync with apps/api/src/demo/demo-form.constants.ts */
const COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "India",
  "Singapore",
  "United Arab Emirates",
  "Netherlands",
  "Other",
] as const;

const TEAM_SIZES = ["1–10", "11–50", "51–200", "201–1000", "1000+"] as const;

const CALLS_PER_DAY = ["Under 50", "50–200", "200–1000", "1000+"] as const;

const DIRECTIONS = [
  { id: "outbound", label: "Outbound" },
  { id: "inbound", label: "Inbound" },
  { id: "both", label: "Both" },
] as const;

const INTEGRATION_OPTIONS = [
  "Google Calendar",
  "Outlook",
  "Salesforce",
  "HubSpot",
  "Zendesk",
  "Custom / API",
  "Not sure yet",
] as const;

type Direction = (typeof DIRECTIONS)[number]["id"];

interface FormState {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  teamSize: string;
  callsPerDay: string;
  direction: Direction | "";
  integrations: string[];
  /** Honeypot — must stay empty. */
  website: string;
}

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  country: "",
  teamSize: "",
  callsPerDay: "",
  direction: "",
  integrations: [],
  website: "",
};

/** Basic email shape check (mirrors server IsEmail intent for UX). */
function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (!email || email.length > 255) return false;
  // RFC 5322-lite: local@domain with a TLD
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function ProductMock() {
  return (
    <div className="gd-mock" aria-hidden>
      <div className="gd-mock-chrome">
        <div className="gd-mock-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="gd-mock-url">app.speeko.io/agents</div>
      </div>
      <div className="gd-mock-body">
        <div className="gd-mock-sidebar">
          <div className="gd-mock-brand">Speeko</div>
          <div className="gd-mock-nav-item gd-mock-nav-active">Overview</div>
          <div className="gd-mock-nav-item">Live calls</div>
          <div className="gd-mock-nav-item">History</div>
          <div className="gd-mock-nav-item">Config</div>
        </div>
        <div className="gd-mock-main">
          <div className="gd-mock-top">
            <div>
              <div className="gd-mock-eyebrow">Appointment confirmation</div>
              <div className="gd-mock-title">Live call · Sarah Chen</div>
            </div>
            <span className="gd-mock-live">
              <span className="gd-mock-live-dot" />
              Live
            </span>
          </div>
          <div className="gd-mock-stats">
            <div className="gd-mock-stat">
              <span>Duration</span>
              <strong>2:14</strong>
            </div>
            <div className="gd-mock-stat">
              <span>Outcome</span>
              <strong className="gd-mock-ok">Confirmed</strong>
            </div>
            <div className="gd-mock-stat">
              <span>Agent</span>
              <strong>Outbound</strong>
            </div>
          </div>
          <div className="gd-mock-transcript">
            <div className="gd-mock-line agent">
              <span className="gd-mock-who">Agent</span>
              Confirming your appointment tomorrow at 10:30 AM.
            </div>
            <div className="gd-mock-line user">
              <span className="gd-mock-who">Caller</span>
              Yes, that still works for me. Thank you!
            </div>
            <div className="gd-mock-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  "",
) || "/api";

/**
 * Marketing get-demo form.
 * Submits to POST /api/demo/request → server proxies to integration enqueue (agent dials).
 */
export default function GetDemoPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  const toggleIntegration = (name: string) => {
    setForm((prev) => {
      const has = prev.integrations.includes(name);
      if (name === "Not sure yet") {
        return { ...prev, integrations: has ? [] : ["Not sure yet"] };
      }
      const withoutUnsure = prev.integrations.filter((i) => i !== "Not sure yet");
      return {
        ...prev,
        integrations: has
          ? withoutUnsure.filter((i) => i !== name)
          : [...withoutUnsure, name],
      };
    });
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Enter your first and last name.");
      return;
    }
    if (!form.company.trim()) {
      setError("Enter your company name.");
      return;
    }
    if (!form.email.trim()) {
      setError("Enter your work email.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!form.phone.trim() || form.phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number.");
      return;
    }
    if (!form.country) {
      setError("Select a country.");
      return;
    }
    if (!form.teamSize) {
      setError("Select your team size.");
      return;
    }
    if (!form.callsPerDay) {
      setError("Select how many calls you carry out a day.");
      return;
    }
    if (!form.direction) {
      setError("Choose outbound, inbound, or both.");
      return;
    }
    if (form.integrations.length === 0) {
      setError("Select at least one integration (or “Not sure yet”).");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/demo/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          company: form.company.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          country: form.country,
          teamSize: form.teamSize,
          callsPerDay: form.callsPerDay,
          direction: form.direction,
          integrations: form.integrations,
          website: form.website,
        }),
      });

      let message: string | null = null;
      try {
        const data = (await res.json()) as {
          message?: string | string[];
          ok?: boolean;
        };
        if (!res.ok) {
          const raw = data.message;
          message = Array.isArray(raw)
            ? raw.join(" ")
            : typeof raw === "string"
              ? raw
              : null;
        }
      } catch {
        // non-JSON error body
      }

      if (res.status === 429) {
        setError(
          "Too many demo requests. Please try again in a few minutes.",
        );
        return;
      }

      if (!res.ok) {
        setError(
          message ||
            "Something went wrong submitting your request. Please try again.",
        );
        return;
      }

      setSubmitted(true);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gd-page">
      <div className="gd-left">
        <div className="gd-left-glow" />
        <div className="gd-left-grain" />
        <div className="gd-left-inner">
          <Link to="/" className="gd-logo">
            Speeko
          </Link>
          <div className="gd-left-copy">
            <p className="gd-eyebrow">Product demo</p>
            <h1 className="gd-headline">
              See voice agents handle real calls — live.
            </h1>
            <p className="gd-sub">
              Walk through outbound confirmations and inbound booking with transcripts,
              outcomes, and the integrations your team already uses.
            </p>
          </div>
          <ProductMock />
          <p className="gd-left-foot">Trusted by ops teams who live on the phone.</p>
        </div>
      </div>

      <div className="gd-right">
        <div className="gd-card">
          <p className="gd-card-eyebrow">Request a demo</p>
          <h2 className="gd-card-title">Get a personalized walkthrough</h2>
          <p className="gd-card-lead">
            Tell us about your team — we&apos;ll tailor the demo to your volume and stack.
          </p>

          {submitted ? (
            <div className="gd-success" role="status">
              <p className="gd-success-title">You&apos;re all set</p>
              <p className="gd-success-body">
                Our agent will call you shortly at the number you provided.
                Pick up to walk through a live Speeko demo.
              </p>
              <Link to="/" className="gd-success-link">
                Back to home
              </Link>
            </div>
          ) : (
          <form className="gd-form" onSubmit={handleSubmit} noValidate>
                <div className="gd-hp" aria-hidden="true">
                  <label>
                    Company website
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(e) => setField("website", e.target.value)}
                    />
                  </label>
                </div>
                {error && (
                  <div className="gd-error" role="alert">
                    {error}
                  </div>
                )}

                <div className="gd-row">
                  <label className="gd-field">
                    <span>First name</span>
                    <input
                      type="text"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(e) => setField("firstName", e.target.value)}
                      placeholder="Alex"
                    />
                  </label>
                  <label className="gd-field">
                    <span>Last name</span>
                    <input
                      type="text"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => setField("lastName", e.target.value)}
                      placeholder="Morgan"
                    />
                  </label>
                </div>

                <label className="gd-field">
                  <span>Company name</span>
                  <input
                    type="text"
                    autoComplete="organization"
                    value={form.company}
                    onChange={(e) => setField("company", e.target.value)}
                    placeholder="Acme Health"
                  />
                </label>

                <label className="gd-field">
                  <span>Work email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="alex@acme.health"
                  />
                </label>

                <div className="gd-row">
                  <label className="gd-field">
                    <span>Phone number</span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      placeholder="+1 555 010 2000"
                    />
                  </label>
                  <label className="gd-field">
                    <span>Country</span>
                    <select
                      value={form.country}
                      onChange={(e) => setField("country", e.target.value)}
                    >
                      <option value="">Select…</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="gd-row">
                  <label className="gd-field">
                    <span>Team size</span>
                    <select
                      value={form.teamSize}
                      onChange={(e) => setField("teamSize", e.target.value)}
                    >
                      <option value="">Select…</option>
                      {TEAM_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="gd-field">
                    <span>Calls per day</span>
                    <select
                      value={form.callsPerDay}
                      onChange={(e) => setField("callsPerDay", e.target.value)}
                    >
                      <option value="">Select…</option>
                      {CALLS_PER_DAY.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset className="gd-fieldset">
                  <legend>What do you expect?</legend>
                  <div className="gd-segment" role="radiogroup" aria-label="Call direction">
                    {DIRECTIONS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        role="radio"
                        aria-checked={form.direction === d.id}
                        className={
                          form.direction === d.id ? "gd-segment-btn is-active" : "gd-segment-btn"
                        }
                        onClick={() => setField("direction", d.id)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="gd-fieldset">
                  <legend>Integrations you need</legend>
                  <div className="gd-chips">
                    {INTEGRATION_OPTIONS.map((name) => {
                      const active = form.integrations.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          className={active ? "gd-chip is-active" : "gd-chip"}
                          aria-pressed={active}
                          onClick={() => toggleIntegration(name)}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

            <button type="submit" className="gd-submit" disabled={submitting}>
              <span className="gd-submit-label">
                {submitting ? "Submitting…" : "Get demo"}
              </span>
              {!submitting && (
                <span className="gd-submit-arrow" aria-hidden>
                  →
                </span>
              )}
            </button>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
