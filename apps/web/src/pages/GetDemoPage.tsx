import {
  DEMO_CALLS_PER_DAY,
  DEMO_COUNTRIES,
  DEMO_DIRECTIONS,
  DEMO_INTEGRATION_OPTIONS,
  DEMO_TEAM_SIZES,
} from "@call-agent/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";
import "./GetDemoPage.css";

const COUNTRIES = DEMO_COUNTRIES;

/** ITU calling codes for the allowlisted countries. `Other` has no fixed code. */
const COUNTRY_DIAL_CODES: Record<(typeof COUNTRIES)[number], string | null> = {
  "United States": "+1",
  "United Kingdom": "+44",
  "Canada": "+1",
  "Australia": "+61",
  "Germany": "+49",
  "France": "+33",
  "India": "+91",
  "Singapore": "+65",
  "United Arab Emirates": "+971",
  "Netherlands": "+31",
  Other: null,
};

const DIAL_CODES_LONGEST_FIRST = [
  ...new Set(
    Object.values(COUNTRY_DIAL_CODES).filter((code): code is string => Boolean(code)),
  ),
].sort((a, b) => b.length - a.length);

const PHONE_PLACEHOLDERS: Record<(typeof COUNTRIES)[number], string> = {
  "United States": "+1 555 010 2000",
  "United Kingdom": "+44 7700 900123",
  "Canada": "+1 416 555 0199",
  "Australia": "+61 412 345 678",
  "Germany": "+49 151 23456789",
  "France": "+33 6 12 34 56 78",
  "India": "+91 98765 43210",
  "Singapore": "+65 8123 4567",
  "United Arab Emirates": "+971 50 123 4567",
  "Netherlands": "+31 6 12345678",
  Other: "+1 555 010 2000",
};

function dialCodeForCountry(country: string): string | null {
  if (!(COUNTRIES as readonly string[]).includes(country)) return null;
  return COUNTRY_DIAL_CODES[country as (typeof COUNTRIES)[number]];
}

/** Compact the start of the number and find a known +dial prefix (longest first). */
function leadingDialCode(phone: string): string | null {
  const compact = phone.trim().replace(/[\s\-().]/g, "");
  if (!compact.startsWith("+")) return null;
  return DIAL_CODES_LONGEST_FIRST.find((code) => compact.startsWith(code)) ?? null;
}

/** Drop an existing +dial prefix (known list, or a generic +NNN) so we can swap countries. */
function stripLeadingDialCode(phone: string, nextCode: string | null): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/[\s\-().]/g, "");
  const known = leadingDialCode(trimmed);
  if (known) {
    return compact.slice(known.length);
  }

  // "91 98765…" when India is selected — do not strip a bare "1" (US/CA).
  if (nextCode && nextCode.length > 2) {
    const digits = nextCode.slice(1);
    const asToken = new RegExp(`^${digits}(?:\\s+|[-().]+)`);
    if (asToken.test(trimmed)) {
      return trimmed.replace(asToken, "").trim();
    }
  }

  if (trimmed.startsWith("+")) {
    return trimmed.replace(/^\+\d{1,4}[\s\-().]*/, "").trim();
  }

  return trimmed;
}

/** Prefix (or replace) the country calling code on the phone field. */
function applyCountryDialCode(phone: string, country: string): string {
  const code = dialCodeForCountry(country);
  if (!code) return phone;
  const rest = stripLeadingDialCode(phone, code);
  return rest ? `${code} ${rest}` : `${code} `;
}

const TEAM_SIZES = DEMO_TEAM_SIZES;

const CALLS_PER_DAY = DEMO_CALLS_PER_DAY;

const DIRECTIONS = [
  { id: DEMO_DIRECTIONS[0], label: "Outbound" },
  { id: DEMO_DIRECTIONS[1], label: "Inbound" },
  { id: DEMO_DIRECTIONS[2], label: "Both" },
] as const;

const INTEGRATION_OPTIONS = DEMO_INTEGRATION_OPTIONS;

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
    if (!form.country) {
      setError("Select a country.");
      return;
    }
    const phone = applyCountryDialCode(form.phone, form.country).trim();
    if (!phone || phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number.");
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
          phone,
          country: form.country,
          teamSize: form.teamSize,
          callsPerDay: form.callsPerDay,
          direction: form.direction,
          integrations: form.integrations,
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
      <header className="gd-mobile-bar">
        <Link to="/" className="gd-logo">
          Speeko
        </Link>
        <p className="gd-eyebrow">Product demo</p>
        <h1 className="gd-headline">See voice agents handle real calls — live.</h1>
      </header>
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
                      placeholder={
                        PHONE_PLACEHOLDERS[
                          form.country as (typeof COUNTRIES)[number]
                        ] ?? "+1 555 010 2000"
                      }
                    />
                  </label>
                  <label className="gd-field">
                    <span>Country</span>
                    <select
                      value={form.country}
                      onChange={(e) => {
                        const country = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          country,
                          phone: applyCountryDialCode(prev.phone, country),
                        }));
                        if (error) setError(null);
                      }}
                    >
                      <option value="">Select…</option>
                      {COUNTRIES.map((c) => {
                        const code = COUNTRY_DIAL_CODES[c];
                        return (
                          <option key={c} value={c}>
                            {code ? `${c} (${code})` : c}
                          </option>
                        );
                      })}
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
