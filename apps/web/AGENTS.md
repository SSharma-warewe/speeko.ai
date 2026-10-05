# Marketing app instructions

Scope: `apps/web`. Inherit the [root instructions](../../AGENTS.md). This is the public Speeko marketing site; authentication and dashboards belong to the portal.

## Routes and SEO

- React routes live in [App.tsx](src/App.tsx). Canonical route metadata lives in [marketing-routes.ts](src/data/marketing-routes.ts); keyword copy/FAQs live in [keyword-pages.ts](src/data/keyword-pages.ts).
- Public pages: `/`, `/get-demo`, `/how-it-works`, `/voice`, `/privacy`, `/solutions`, `/solutions/ai-calling-agents`, `/solutions/whatsapp-services`.
- Keyword pages: `/ai-voice-agent`, `/appointment-confirmation-calls`, `/ai-receptionist`, `/outbound-ai-calling`, `/ai-calling-for-clinics`. Keep their distinct search intent and copy.
- React redirects use `Navigate` with `replace`: `/signup` → `/get-demo`; `/solutions/customer-service` and `/solutions/marketing-sales` → `/solutions/ai-calling-agents`; unknown `/solutions/*` → `/solutions`; other unknown paths → `/`.
- [canonical.ts](src/lib/canonical.ts) normalizes repeated/trailing slashes, strips query/fragment, maps aliases, and uses `https://speeko.ai`. Canonicals never point at localhost or the portal.
- [vite-plugin-marketing-html.ts](vite-plugin-marketing-html.ts) emits a distinct `index.html` for each canonical route, with title, description, canonical, Open Graph/Twitter metadata, and WebPage JSON-LD. Homepage also has WebSite JSON-LD; keyword FAQ JSON-LD comes from the visible FAQ data. Privacy gets crawler-readable root content from the shared privacy document.
- The build generates redirect HTML only for `MARKETING_REDIRECTS` (the two legacy solution URLs). These are noindex HTML redirects with destination canonicals, not HTTP 301s. `/signup` and wildcard redirects are React behavior; they have no generated shells. Do not claim client redirects guarantee direct-request production redirects with the current static server.
- Sitemap generation uses the canonical route catalog and excludes aliases. Keep [public/sitemap.xml](public/sitemap.xml), [robots.txt](public/robots.txt), navigation, canonical aliases, and page data aligned when routes change.
- [public/llms.txt](public/llms.txt) is canonical GEO content; [public/llm.txt](public/llm.txt) must stay byte-identical. HTML includes `rel="describedby"` for `https://speeko.ai/llms.txt`; preserve it in generated canonical shells.
- GA4 `G-5XRJR460G9` loads immediately after `<head>` in [index.html](index.html), is copied into canonical shells, and sends navigation events via [useGtagPageView](src/lib/gtag.ts). Initial HTML config sends the first view; do not double-count it. Portal does not load this tag.
- Production uses `serve dist`, without `-s`, so crawlers receive route-specific HTML. See [deployment instructions](../../railway/AGENTS.md).

## Product copy and consistent UI

- Reuse [MarketingNav](src/components/MarketingNav.tsx), [MarketingFooter](src/components/MarketingFooter.tsx), and existing page/section patterns. Two solution services are AI calling agents and WhatsApp services.
- `/how-it-works` describes the setup runway: virtual number → agents → tools/voice → persona → CRM integration or inbound dispatch. `/voice` explains neural speech, barge-in, and talent/pace/delivery on the agent Voice tab.
- Use `@call-agent/ui` primitives and [UI instructions](../../packages/ui/AGENTS.md). Import its stylesheet once in `main.tsx`; shared tokens/keyframes belong in the package, page layouts remain here.
- Preserve marketing Newsreader display typography, IBM Plex Sans body, IBM Plex Mono technical labels, existing gold/dark CTA variants, and spacing from [global.css](src/global.css). `--mkt-pad` is 56px, 28px below 1080px, and 16px below 720px.
- Follow existing responsive sections, focus states, reduced motion, and readable mobile forms. Keep main CTA wording and destination consistent with the surrounding page.
- Cross-app links use [portal-url.ts](src/lib/portal-url.ts) and build-time `VITE_PORTAL_URL`; API requests use `VITE_API_URL` (default `/api`). Never put server keys in Vite variables.

## Get-demo and public access

- All marketing routes are public; do not introduce portal JWT guards here. Backend `OtpAbuseGuard` and `DemoAbuseGuard` enforce origin/rate limits. Frontend validation is usability, not authorization.
- [GetDemoPage](src/pages/GetDemoPage.tsx) validates person names, company work email, country, phone, team size, call volume, direction, and integration choices before requesting a code. Lead-quality helpers/catalogs come from contracts; API validates them too.
- Flow: `POST /api/otp/send { phone }` → `{ challengeId }`; `POST /api/otp/verify { challengeId, code }` → `{ verificationToken }`; `POST /api/demo/request` includes that proof and the captured `pendingPhone`.
- The UI expects a six-digit WhatsApp code. Successful resend replaces the challenge and clears entered code. Changing the phone returns to the form; submit requests a fresh challenge before verifying that number. Do not reuse a proof for a different number.
- Proof is single-use and consumed server-side before CRM/enqueue. Preserve pending/disabled buttons, API error messages, 429 guidance, network errors, and success states. Do not invent browser OTP generation or a persistent browser proof/session store.
- API owns HMAC verification, expiry, encryption, transactional phone fencing, durable Meta delivery, and demo enqueue. Worker outages do not block OTP sending. See [API architecture](../api/docs/architecture.md) and [schema](../api/docs/schema.md).

## Naming, changes, and verification

- Page/component files and exports use PascalCase (`GetDemoPage.tsx`, `MarketingNav.tsx`); helpers/data use existing kebab-case names; hooks use `use…`; routes use lowercase kebab-case. Match local CSS prefixes (`gd-`, existing marketing section prefixes), not global generic selectors.
- New pages require route registration, route metadata, navigation as applicable, SEO/GEO review, and static-shell verification. Do not copy a second route/SEO catalog into a page.
- From repo root: `npm run typecheck:web`, `npm run build:web`. Inspect the affected generated HTML, sitemap, redirect shells, and GEO files; check navigation and mobile layout for UI changes. Builds validate code; they do not prove live hosting or OTP delivery.
- Local development: `npm run start:web:dev` on port 5173. Read [Railway runbook](../../railway/README.md) before changing build args or hosting.

## Complete public route metadata

Snapshot of src/data/marketing-routes.ts. Update this table with route changes; implementation continues to use that single catalog. Each canonical path emits its own HTML shell; redirect aliases are excluded.

| Path | HTML title | Description | Sitemap priority |
| --- | --- | --- | --- |
| / | Speeko — AI Voice Agents for Inbound & Outbound Calls | Speeko places and answers calls for appointment confirmations and lead outreach — with live transcripts, real-time outcomes, and zero missed follow-ups. | 1.0 |
| /get-demo | Get a Speeko Demo — See AI Voice Agents Handle Calls | See Speeko voice agents handle real inbound and outbound calls. Request a live walkthrough tailored to your volume and stack. | 0.9 |
| /how-it-works | How Speeko Works — From a Number to a Live Voice Agent | Bring a virtual number from Telnyx, Twilio, or your SIP carrier. Name the agents, switch on tools, and take a persona live — no code. | 0.8 |
| /privacy | Privacy Policy — Speeko | How Speeko collects, uses, and protects account, call, and WhatsApp information, including Meta WhatsApp Business permissions. | 0.3 |
| /voice | Neural Voice That People Stay On — Speeko AI Agents | Speeko agents use neural speech you pick on the agent — talent, pace, delivery — so the first second does not sound like an IVR. | 0.8 |
| /solutions | Speeko Solutions — AI Calling Agents and WhatsApp | Two services: AI calling agents that place and answer calls, and WhatsApp that follows Meta’s template and 24-hour window rules. | 0.8 |
| /solutions/ai-calling-agents | AI Calling Agents — Speeko Inbound and Outbound | Speeko AI calling agents answer and place calls, then write the outcome with the tools you enable — confirm, book, transfer, or hang up. | 0.7 |
| /solutions/whatsapp-services | WhatsApp Services — Templates and the 24-Hour Window — Speeko | WhatsApp on Speeko follows Meta’s Cloud API: approved marketing, utility, and authentication templates, plus replies inside the customer service window. | 0.7 |
| /ai-voice-agent | AI Voice Agent for Inbound & Outbound Calls — Speeko | Speeko is an AI voice agent for phone calls: inbound answering and outbound dials, with tools to look someone up, book, confirm, transfer, and hang up. | 0.9 |
| /appointment-confirmation-calls | AI Appointment Confirmation Calls — Speeko Voice Agents | AI appointment confirmation calls that confirm, reschedule, or cancel while the person is on the line — then write the outcome back to your book. | 0.85 |
| /ai-receptionist | AI Receptionist for Inbound Calls — Speeko Voice Agents | An AI receptionist that answers inbound calls, looks the caller up, takes the job it can finish, and transfers the rest to a human. | 0.85 |
| /outbound-ai-calling | Outbound AI Calling with Dial Queue & Retries — Speeko | Outbound AI calling with a real dial queue: concurrency limits, retries on no-answer and busy, and tasks for outreach, qualification, and demo booking. | 0.85 |
| /ai-calling-for-clinics | AI Calling for Clinics — Speeko Appointment Confirmations | Clinic appointment confirmation calls on the number you already have. Speeko agents confirm, move, or cancel visits without replacing your EHR. | 0.85 |

## Redirect and static output map

| Requested path | React behavior | Generated production HTML |
| --- | --- | --- |
| Each of the 13 canonical paths above | Its registered page | `dist/index.html` for root, `dist/<path>/index.html` otherwise; unique head |
| `/signup` | `Navigate replace` to `/get-demo` | No alias shell; direct request may 404 |
| `/solutions/customer-service` | `Navigate replace` to `/solutions/ai-calling-agents` | Legacy alias shell with noindex, destination canonical, meta refresh and `location.replace` |
| `/solutions/marketing-sales` | Same destination | Same alias-shell behavior |
| Unknown `/solutions/*` | `Navigate replace` to `/solutions` | No wildcard shell |
| Other unknown paths | `Navigate replace` to `/` | No wildcard shell |

Development Vite fallback and an already-loaded React router can handle aliases that the production static host cannot directly serve. Changing this behavior requires deliberate hosting/SEO work; preserve `serve dist` for distinct canonical HTML.

The HTML plugin escapes metadata attributes and rebuilds JSON-LD from route data. Preserve `speeko-jsonld` WebPage objects with name/description/url and WebSite ownership; root contains the WebSite/WebPage graph. Keyword FAQs generate `speeko-faq-jsonld` with Question/acceptedAnswer content matching visible FAQs. Do not add FAQ schema disconnected from rendered copy. Privacy prepopulates crawler content through `privacyCrawlerRootHtml` from the shared privacy document.

When editing the template, preserve the canonical, description, `og:title`/`og:description`/`og:url`, Twitter title/description, existing image/card tags, GA4 snippet, and GEO describedby link. Plugin replacements depend on matching the existing head tags; removing or changing their structure can silently leave incorrect route metadata. Sitemap priority comes from the catalog; aliases never become canonical sitemap entries. Keep crawler directives consistent with public-page intent.

## OTP form states and server ownership

Form state contains firstName, lastName, company, email, phone, country, teamSize, callsPerDay, direction, and integrations. Country choices, team/call volume/direction/integration options come from contracts. Person-name checks reject placeholder/test names; work-email validation rejects free/disposable/reserved domains while allowing custom-domain Google Workspace/Microsoft 365.

Country changes prefix or replace the calling code while retaining the entered local number. Known dial prefixes match longest first. United States/Canada use +1, United Kingdom +44, Australia +61, Germany +49, France +33, India +91, Singapore +65, United Arab Emirates +971, Netherlands +31; Other has no automatic code. Preserve readable examples and errors without treating browser formatting as server authorization.

1. Validate the form, capture `pendingPhone`, and disable duplicate submissions while sending.
2. Send `{ phone }` to `/api/otp/send`. Keep only the challenge ID in transient component state; never generate a code in the browser.
3. Show the WhatsApp six-digit code entry. Verification sends `{ challengeId, code }` to `/api/otp/verify`.
4. Use the returned `verificationToken` with the captured same phone and form fields on `/api/demo/request`.
5. Only completed demo submission shows success. An OTP verification alone does not mean CRM/enqueue succeeded.
6. Resend requests a new challenge and clears entered code. Editing the phone returns to the form and requires a new send/verify cycle.

Wrong, expired, or attempt-locked codes share the API error. Preserve field errors, sending/verifying/submitting states, disabled controls, resend/edit actions, HTTP errors, network failures, and rate-limit guidance. Do not persist OTP/proofs in localStorage or logs. The component reads standard API `message` values, including validation arrays.

API challenges expire after five minutes with at most five verification attempts; proofs expire after ten minutes and are single-use/same-phone. Send success means Meta accepted the template, not delivery/read. Delivery is durable priority outbox work; a model-worker outage must not block it. Missing platform/OTP configuration yields 503. Ambiguous sends burn the challenge and are not blindly repeated.

The server consumes the proof before best-effort GHL lead upsert and integration enqueue. A successful upsert adds `ghlContactId` for later calendar booking. CRM failure is nonfatal; abuse/origin/validation failures do not enqueue. `ENDPOINT_URL`, `SPEEKO_API`, Meta tokens, OTP hashing/encryption keys, and GHL credentials stay on API, never Vite.

## Design and local review checklist

Use the existing MarketingNav/Footer and section/page CSS alongside shared Button/Input/Field/Badge/Card/Chip/Alert/motion primitives. Marketing display font is Newsreader; body is IBM Plex Sans; technical labels use IBM Plex Mono. Shared semantic tokens/keyframes come from UI; page arrangements, product illustrations, and marketing section spacing stay here.

Match CTA styling, wording, destinations, readable line lengths, gold/dark treatment, section spacing, responsive navigation, and form density to adjacent pages. Do not add a different font/button system for a new landing page. Motion honors reduced-motion and never carries status alone.

`VITE_API_URL` defaults to `/api` through the local proxy; production needs the public API prefix. `VITE_PORTAL_URL` selects portal sign-in/deep links. Both are public build-time inputs requiring a web rebuild when changed.

For a changed route, check the catalog, React registration, canonical aliases, navigation, sitemap, robots, static output, privacy/FAQ schema, GA page-view behavior and both byte-identical GEO files. Check mobile and keyboard/focus usability for UI changes. Run `npm run typecheck:web` and `npm run build:web` when code changes; documentation-only edits require content/link checks without real OTP calls.
