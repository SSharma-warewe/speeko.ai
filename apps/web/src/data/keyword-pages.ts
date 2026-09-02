import type { KeywordPath } from "./marketing-routes";

export type KeywordFaq = {
  q: string;
  a: string;
};

export type KeywordSection = {
  h2: string;
  body: string[];
};

export type KeywordRelated = {
  to: string;
  kicker: string;
  title: string;
  body: string;
};

export type KeywordPageCopy = {
  path: KeywordPath;
  kicker: string;
  h1: string;
  lead: string;
  chips: string[];
  sections: KeywordSection[];
  faqs: KeywordFaq[];
  related: KeywordRelated[];
  cross: KeywordRelated;
  closeTitle: string;
  closeBody: string;
};

export const KEYWORD_NAV = [
  {
    to: "/ai-voice-agent",
    title: "AI voice agent",
    sub: "Inbound + outbound that can act",
  },
  {
    to: "/appointment-confirmation-calls",
    title: "Appointment calls",
    sub: "Confirm, move, or cancel live",
  },
  {
    to: "/ai-receptionist",
    title: "AI receptionist",
    sub: "After-hours and overflow inbound",
  },
  {
    to: "/outbound-ai-calling",
    title: "Outbound calling",
    sub: "Queue, retry, then talk",
  },
  {
    to: "/ai-calling-for-clinics",
    title: "Clinics",
    sub: "Front-desk confirmations",
  },
] as const;

export const KEYWORD_PAGES: KeywordPageCopy[] = [
  {
    path: "/ai-voice-agent",
    kicker: "Product",
    h1: "An AI voice agent that finishes the call.",
    lead: "Speeko is a voice agent for real phone calls — inbound rings and outbound dials. It does not stop at a transcript. You switch on tools, pick a task, and the call ends with a written outcome.",
    chips: ["Inbound", "Outbound", "Tools", "SIP"],
    sections: [
      {
        h2: "What an AI voice agent actually is",
        body: [
          "An AI voice agent answers or places a phone call, talks in a voice you choose, and runs actions you enabled — look someone up, confirm a visit, book a slot, transfer, hang up. Speech is the interface. The work is the tool that wrote something back.",
          "Chatbots and IVR trees are the wrong comparison. People hang up on menus. They stay when the first second sounds like a person and the agent can do the job they called about.",
        ],
      },
      {
        h2: "Inbound and outbound on the same agent platform",
        body: [
          "Inbound: point a virtual number at Speeko. A dispatch rule packs the persona, tools, and default task. The agent greets, identifies the caller when you have a record, and either finishes or transfers.",
          "Outbound: you enqueue numbers (or your CRM posts one). The API owns the dial queue — concurrency, retries on no-answer and busy, quiet hours. The worker is voice-only. Task is chosen on the call or integration, not baked into the inbound persona.",
        ],
      },
      {
        h2: "Tools, not a longer prompt",
        body: [
          "The system prompt is persona: who the agent is, tone, what it must not do. Workflow lives in a task (confirm an appointment, qualify a lead, book a demo). Capabilities are a tool profile — hang up is always on; lookup, calendar, GoHighLevel, transfer are opt-in.",
          "If a verb is not on the profile, the agent cannot pretend it ran. That is how a confirmation actually lands in the book instead of a voicemail your staff replay.",
        ],
      },
      {
        h2: "Voice people do not immediately cut",
        body: [
          "Neural speech, a talent you pick, pace and delivery on the agent Voice tab. Barge-in: they can talk over it. The first second is the whole call. Flat hold-music agents lose here; Speeko is built not to.",
        ],
      },
      {
        h2: "Go live on a number you already have",
        body: [
          "Bring a Telnyx, Twilio, or SIP trunk. Name the agent, switch on tools, link a calendar if the job needs one, publish inbound or start the outbound queue. No code, no new carrier required.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is Speeko an AI voice agent or a chatbot?",
        a: "A phone voice agent. It places and answers calls over SIP, speaks, listens with barge-in, and runs tools. It is not a website chat widget.",
      },
      {
        q: "Can one Speeko agent do inbound and outbound?",
        a: "Yes. Inbound and outbound are named configs on the same platform. Inbound carries a default task on the agent. Outbound picks the task per call, batch, or CRM endpoint.",
      },
      {
        q: "Do I need to replace my phone provider?",
        a: "No. You bring a virtual number from Telnyx, Twilio, or your SIP carrier and point it at Speeko.",
      },
      {
        q: "What can the agent actually do on the call?",
        a: "Whatever you enabled on the tool profile: hang up, lookup, confirm, book, cancel, transfer, calendar free/busy, GoHighLevel contacts and meetings. Unenabled tools do not run.",
      },
    ],
    related: [
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "Confirm, reschedule, or cancel while they are still on the line.",
      },
      {
        to: "/ai-receptionist",
        kicker: "Use case",
        title: "AI receptionist",
        body: "Inbound that answers, looks up, and transfers the rest.",
      },
      {
        to: "/outbound-ai-calling",
        kicker: "Use case",
        title: "Outbound AI calling",
        body: "A dial queue with retries, not a one-shot blast.",
      },
    ],
    cross: {
      to: "/how-it-works",
      kicker: "Setup",
      title: "From a number to a live agent.",
      body: "Trunk, persona, tools, then publish or enqueue. No code.",
    },
    closeTitle: "Hear it on a live number.",
    closeBody: "Bring a Telnyx or Twilio number. Leave with an agent that can act.",
  },
  {
    path: "/appointment-confirmation-calls",
    kicker: "Use case",
    h1: "Confirm the visit while they're still on the line.",
    lead: "Appointment confirmation calls only count if the book changes. Speeko agents call or answer, cite the visit, and write confirmed, rescheduled, or cancelled — not a voicemail your front desk has to replay.",
    chips: ["Confirm", "Reschedule", "Cancel", "Lookup"],
    sections: [
      {
        h2: "The call is the write-back",
        body: [
          "A reminder that ends in “please call us back” is still your staff’s job. Speeko’s confirm-appointment path persists CONFIRMED, RESCHEDULED, or CANCELLED against the booking id, with an optional new time. Tomorrow’s list is actually worked.",
        ],
      },
      {
        h2: "They should not have to re-introduce themselves",
        body: [
          "CRM or integration context rides on the call: name, time, provider, booking id. Lookup prefers those fields so the agent can say “Elena, Dr. Patel at 9:30” instead of treating every ring as a stranger.",
        ],
      },
      {
        h2: "Inbound reminders and outbound lists",
        body: [
          "Outbound: enqueue tomorrow’s appointments. The queue dials under your concurrency cap, retries no-answer and busy, respects quiet hours. Inbound: they call you — same persona, same confirm / move / cancel tools.",
        ],
      },
      {
        h2: "After hours is when no-shows start",
        body: [
          "Evening and weekend rings still get a person-sounding voice and a finished outcome. Transfer stays on the profile if someone needs a human during desk hours.",
        ],
      },
      {
        h2: "Calendar when the slot has to be real",
        body: [
          "Nylas or GoHighLevel on the agent: check free slots, book, cancel. The agent does not invent a time that is already taken. Hangup is always included so the line clears when the job is done.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is this just an appointment reminder robocall?",
        a: "No. The agent talks, handles confirm / reschedule / cancel, and writes the result back. A one-way reminder blast is a different product.",
      },
      {
        q: "Can it reschedule, not only confirm?",
        a: "Yes. Confirm-appointment stores CONFIRMED, RESCHEDULED, or CANCELLED. Calendar tools check open slots when you enable them.",
      },
      {
        q: "Do you need our EHR?",
        a: "No rip-and-replace. Speeko talks over SIP on your number and writes through the tools you connect — CRM context, calendar, or a thin enqueue from the system you already have.",
      },
      {
        q: "What if nobody picks up?",
        a: "Outbound retries under your queue settings (no-answer, busy, backoff, max attempts). The row is not marked completed unless the task actually finished.",
      },
    ],
    related: [
      {
        to: "/ai-calling-for-clinics",
        kicker: "Vertical",
        title: "AI calling for clinics",
        body: "Front-desk confirmations on the number you already publish.",
      },
      {
        to: "/ai-voice-agent",
        kicker: "Product",
        title: "AI voice agent",
        body: "Inbound and outbound, tools on a profile, SIP you bring.",
      },
      {
        to: "/outbound-ai-calling",
        kicker: "Use case",
        title: "Outbound AI calling",
        body: "How the dial queue claims, dials, and retries.",
      },
    ],
    cross: {
      to: "/solutions/customer-service",
      kicker: "Tools",
      title: "Customer service stack",
      body: "Hangup, lookup, confirm, calendar, transfer — the kit for this job.",
    },
    closeTitle: "Put confirmations on a number.",
    closeBody: "Same tools in the portal. Pick the task, enqueue tomorrow’s list.",
  },
  {
    path: "/ai-receptionist",
    kicker: "Use case",
    h1: "The inbound line that actually answers.",
    lead: "An AI receptionist is only useful if it picks up, knows who is calling, and either finishes or hands off. Speeko inbound agents do that on the virtual number you already have — after hours and during overflow.",
    chips: ["Inbound", "Lookup", "Transfer", "After hours"],
    sections: [
      {
        h2: "Missed inbound is still a person on hold",
        body: [
          "Overflow and closed-hours rings go to voicemail, then a callback list. A Speeko inbound agent greets immediately, in a voice you set, and stays on the job you assigned: take a booking, confirm a visit, answer what the tools allow, or transfer.",
        ],
      },
      {
        h2: "Look them up, then decide",
        body: [
          "Lookup by phone, email, or name, preferring CRM fields already on the call. Known patients get the right visit. Unknown callers get a clean intake — not a 12-option IVR.",
        ],
      },
      {
        h2: "Finish or transfer — do not fake either",
        body: [
          "Booking, confirm, cancel, calendar, hangup: only if those ids are on the profile. Transfer is how billing disputes, clinical questions, and angry callers leave the agent and land on your team with a reason. The agent does not role-play a nurse.",
        ],
      },
      {
        h2: "Dispatch is a persona, not a shared inbox",
        body: [
          "Inbound routing is a dispatch rule: which trunks, which organization agent, which default task. You can run a confirmation persona on one number and a general receptionist on another. Publish when the trunk is live.",
        ],
      },
      {
        h2: "Same dashboard as outbound",
        body: [
          "Transcript, tool events, task status (completed vs hung up incomplete). Staff see what was said and what was written — not a black-box “AI handled it.”",
        ],
      },
    ],
    faqs: [
      {
        q: "Will it replace the front desk?",
        a: "It takes the calls the desk cannot get to — after hours, overflow, routine confirm/book. Transfer stays available for everything that needs a human.",
      },
      {
        q: "How does a caller reach Speeko?",
        a: "You publish an inbound SIP trunk and a dispatch rule, then point Telnyx, Twilio, or your carrier at Speeko for those numbers.",
      },
      {
        q: "Can it book, or only take a message?",
        a: "If book / calendar / GHL meeting tools are on the profile and a calendar is linked, it can take a real slot. Otherwise it should transfer or hang up — it should not promise a time it cannot write.",
      },
      {
        q: "What does the caller hear first?",
        a: "Your opening line (or the built-in default), in the talent and pace on the Voice tab. Empty opening is allowed if you want silence; most receptionists should greet.",
      },
    ],
    related: [
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "The inbound job most clinics actually need finished.",
      },
      {
        to: "/voice",
        kicker: "Voice",
        title: "Voice people stay on",
        body: "Talent, pace, delivery, barge-in — the first second.",
      },
      {
        to: "/ai-voice-agent",
        kicker: "Product",
        title: "AI voice agent",
        body: "How inbound and outbound share tools and persona.",
      },
    ],
    cross: {
      to: "/how-it-works",
      kicker: "Setup",
      title: "Publish inbound.",
      body: "Draft the trunk, attach a dispatch rule, then go live.",
    },
    closeTitle: "Put a receptionist on the overflow line.",
    closeBody: "Bring the number. Pick lookup, book, transfer. Publish.",
  },
  {
    path: "/outbound-ai-calling",
    kicker: "Use case",
    h1: "Outbound calls that retry until they connect.",
    lead: "Outbound AI calling fails as a blast: one dial, no-answer, done. Speeko queues the list, caps concurrency, retries busy and no-answer, and only marks the row completed when the task actually finished.",
    chips: ["Queue", "Retries", "Outreach", "CRM dial-in"],
    sections: [
      {
        h2: "The API owns the dialer",
        body: [
          "You enqueue pending calls (one or a batch). A dialer claims rows, opens the room, and places the SIP leg. The voice worker never dials and never talks to your database. That split is how you get continuous outbound without pinning agent processes on ring time.",
        ],
      },
      {
        h2: "Retries are a policy, not a hope",
        body: [
          "No-answer, busy, SIP error, timeout — if the code is in your retry list and attempts remain, the call goes back to pending with backoff (fixed or exponential) and optional quiet hours. Incomplete conversations are not silently redialed. You pause the org or a batch without deleting the list.",
        ],
      },
      {
        h2: "The task is the job, not the persona",
        body: [
          "Outbound agents do not store a default task. You pick it on the call, the batch, or the integration endpoint: lead qualification, demo booking, interview booking, confirm appointment, survey. Persona stays who they are; the task is what this dial must finish.",
        ],
      },
      {
        h2: "CRM sends a thin request",
        body: [
          "An integration endpoint bakes in agent, task, trunk, and queue overrides. Your CRM posts a phone number plus optional context. Speeko merges that with the endpoint defaults and enqueues. Agent choice does not leak into every webhook.",
        ],
      },
      {
        h2: "Demo-set and outreach need calendar tools",
        body: [
          "Qualification is conversation. A meeting landing is check-slots + create event (Nylas) or GHL free slots + schedule. Enable those ids on the outbound profile or the agent will talk a good game and write nothing.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is this auto-dialer spam?",
        a: "It is a queued outbound agent with caps, retries, and a task. You bring the numbers and the consent. Speeko does not scrape lists or run a shared calling pool.",
      },
      {
        q: "What happens on no-answer?",
        a: "The worker reports failed / no_answer. If that code is in retry_on and attempts remain, the row returns to pending after backoff. Otherwise it stays failed.",
      },
      {
        q: "Can we pause a campaign?",
        a: "Yes. Pause the org queue or a single batch. Pending calls sit. Cancel a batch and pending rows go cancelled.",
      },
      {
        q: "How do we start a call from GoHighLevel or another CRM?",
        a: "Create an integration endpoint in the portal (agent, task, trunk). The CRM POSTs phoneNumber plus optional context and API key. Same queue as bulk enqueue.",
      },
    ],
    related: [
      {
        to: "/solutions/marketing-sales",
        kicker: "Tools",
        title: "Marketing & sales stack",
        body: "GHL contacts, free slots, schedule — how a meeting actually lands.",
      },
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "The other outbound job: tomorrow’s list, written back.",
      },
      {
        to: "/ai-voice-agent",
        kicker: "Product",
        title: "AI voice agent",
        body: "Persona, tools, and SIP on one platform.",
      },
    ],
    cross: {
      to: "/how-it-works",
      kicker: "Setup",
      title: "Queue, then dial.",
      body: "Outbound trunk, agent, task on the call — the dialer does the rest.",
    },
    closeTitle: "Enqueue a real list.",
    closeBody: "One call or fifty. The queue respects your cap and retries.",
  },
  {
    path: "/ai-calling-for-clinics",
    kicker: "Clinics",
    h1: "Front desk calls without a new EHR.",
    lead: "Clinics lose hours to “confirming tomorrow.” Speeko runs those calls on the number patients already know — confirm, move, or cancel — and leaves the chart system where it is.",
    chips: ["Clinics", "Confirmations", "SIP", "No new EHR"],
    sections: [
      {
        h2: "The desk is already full",
        body: [
          "Morning lists, no-shows, “can we do Thursday instead.” Speeko takes the routine confirmation loop so staff keep the exceptions: clinical questions, billing, upset families. Transfer is on the profile for those.",
        ],
      },
      {
        h2: "Keep the record you have",
        body: [
          "You do not migrate the EHR to use Speeko. Bring the clinic’s Telnyx, Twilio, or SIP number. Push tomorrow’s appointments in (portal bulk or a CRM/integration POST) with name, time, booking id. The agent writes confirm / reschedule / cancel back through the tools you enabled.",
        ],
      },
      {
        h2: "They hear a person, not a reminder tree",
        body: [
          "Talent, pace, and delivery on the Voice tab. Barge-in when they talk over the agent. Cite the provider and time from context so it does not sound like a robocall farm. That is the difference between a completed confirm and an immediate hangup.",
        ],
      },
      {
        h2: "After-hours cancellations still free the slot",
        body: [
          "Evening “I can’t make 8am” should not wait for voicemail. Inbound on the same persona can cancel or move if those tools are on. The slot is usable the same night, not after a no-show.",
        ],
      },
      {
        h2: "What staff see the next morning",
        body: [
          "A call tape: transcript, tool events, task completed vs incomplete. Not a mystery AI. If the agent confirmed, the row says so. If they hung up mid-sentence, it is incomplete — and not auto-redialed as if it were a no-answer.",
        ],
      },
    ],
    faqs: [
      {
        q: "Do we have to switch phone systems?",
        a: "No. Point your existing virtual number (Telnyx, Twilio, or SIP) at Speeko. Patients keep the number on the card.",
      },
      {
        q: "Will this replace our EHR?",
        a: "No. Speeko is the voice layer. Booking ids and names come in as call context. Write-back is the confirm/book/cancel/calendar tools you connect — not a new chart.",
      },
      {
        q: "Can it handle new-patient booking?",
        a: "If book and calendar tools are enabled and a calendar is linked, yes. Many clinics start with confirmations only, then add booking.",
      },
      {
        q: "What about clinical advice?",
        a: "Persona policy plus transfer. The agent should not give medical advice. Clinical questions go to a human; the tools are for the visit logistics.",
      },
    ],
    related: [
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "The job: confirm, reschedule, cancel, written back.",
      },
      {
        to: "/ai-receptionist",
        kicker: "Use case",
        title: "AI receptionist",
        body: "Overflow and after-hours inbound on the clinic line.",
      },
      {
        to: "/solutions/customer-service",
        kicker: "Tools",
        title: "Customer service tools",
        body: "The kit: hangup, lookup, confirm, calendar, transfer.",
      },
    ],
    cross: {
      to: "/how-it-works",
      kicker: "Setup",
      title: "Number, then persona.",
      body: "Clinic SIP in. Confirmation agent live. List in the queue.",
    },
    closeTitle: "Try it on tomorrow’s list.",
    closeBody: "Same number patients already call. Confirmations that write back.",
  },
];

export const KEYWORD_PAGE_BY_PATH: Record<KeywordPath, KeywordPageCopy> =
  Object.fromEntries(KEYWORD_PAGES.map((page) => [page.path, page])) as Record<
    KeywordPath,
    KeywordPageCopy
  >;
