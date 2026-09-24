import { PRIVACY_EMAIL, PRIVACY_UPDATED } from "./privacy";

const MAILTO = `mailto:${PRIVACY_EMAIL}`;

/**
 * Policy body as HTML. The marketing build places this inside `/privacy`
 * before JavaScript runs, so a crawler that does not execute scripts still
 * receives the full text (Meta app review, link unfurls, agents).
 */
export function privacyArticleHtml(): string {
  return `<p>By using Speeko, you agree to the practices in this policy. If you are a person who received a phone call or WhatsApp message from a business that uses Speeko, that business decides why you were contacted. We process that conversation to provide the service they configured.</p>
<section id="collect"><h2>1. Information we collect</h2>
<p>We collect the following categories of information when you use Speeko.</p>
<h3>1.1 Account information</h3>
<p>When a business creates or uses a Speeko account, we may collect:</p>
<ul>
<li>Name</li>
<li>Email address</li>
<li>Phone number</li>
<li>Company or organization name</li>
<li>Login information (we store a password hash, not the password itself)</li>
<li>Account preferences, agent configuration, and tool settings</li>
</ul>
<h3>1.2 Voice calls</h3>
<p>When a business places or answers calls with Speeko, we process what the call needs in order to run:</p>
<ul>
<li>Phone numbers dialed or received</li>
<li>Call audio, in real time, so the agent can hear and speak</li>
<li>A transcript of the conversation</li>
<li>The outcome of the call and the tools the agent used</li>
<li>Usage needed to operate the call and show its cost</li>
<li>Context the business supplies for that call, such as a name, an appointment, or other CRM fields</li>
</ul>
<p>Speeko stores the transcript, outcome, and related call record. We do not keep a library of call recordings.</p>
<h3>1.3 Demo requests</h3>
<p>The public demo form collects your name, company, work email, phone number, country, team size, approximate call volume, whether you want inbound or outbound, and the systems you name. Before we accept the request, we send a one-time code to that phone on WhatsApp. We store a hash of the code and a short-lived verification token. We do not store the code itself. A successful request may be added to our CRM and used to queue a demo call.</p>
<h3>1.4 WhatsApp and Meta information</h3>
<p>When you connect a Meta or WhatsApp Business account to Speeko, we may receive information that you authorize Meta to provide. Depending on the features you enable, this may include:</p>
<ul>
<li>Meta account or user identifier</li>
<li>Basic public profile information made available through Meta</li>
<li>Business or business portfolio identifiers</li>
<li>WhatsApp Business Account (WABA) identifiers</li>
<li>WhatsApp business phone number identifiers</li>
<li>Business phone numbers associated with a connected WhatsApp Business Account</li>
<li>WhatsApp business profile information</li>
<li>Message template information</li>
<li>WhatsApp messages and message metadata</li>
<li>Message delivery, sent, and received status</li>
<li>Webhook events for your connected WhatsApp Business Account</li>
<li>Access credentials or tokens required to operate the integration you authorized</li>
</ul>
<p>We only access Meta and WhatsApp information that is necessary for the features you enable. Webhook verify tokens are stored as hashes. We show a raw verify token only when you generate or rotate it.</p>
<h3>1.5 WhatsApp messages</h3>
<p>If you connect WhatsApp to Speeko, our systems may process messages sent to or from your connected WhatsApp Business phone number. This may include:</p>
<ul>
<li>Message text</li>
<li>Message timestamps</li>
<li>Sender and recipient phone numbers</li>
<li>Message identifiers</li>
<li>Message status</li>
<li>Media or attachments sent through WhatsApp, where that feature is enabled</li>
<li>Conversation information needed for the automation you configured</li>
</ul>
<p>Webhook events Meta sends us are stored so the connected business can see them. Where you enable an AI agent for that number, message content may be processed to generate a response or take an action you configured.</p>
<h3>1.6 Calendars and other connections</h3>
<p>If you connect a calendar or CRM, such as Nylas or GoHighLevel, we store the credentials and account identifiers needed to run the tools you turn on. We do not show those secrets again in the product after you save them. Call tools may read or write the calendar events and contacts those tools are built to use.</p>
<h3>1.7 Website analytics</h3>
<p>The public marketing site uses Google Analytics 4 to measure page views. The signed-in portal does not load that tag. We do not use Meta or WhatsApp data for this analytics.</p>
</section>
<section id="use"><h2>2. How we use information</h2>
<p>We use information collected through Speeko to:</p>
<ul>
<li>Provide and operate voice agents, queues, and the portal</li>
<li>Place and answer phone calls the business configures</li>
<li>Connect and manage an authorized WhatsApp Business integration</li>
<li>Send and receive WhatsApp messages on behalf of that business, when enabled</li>
<li>Process incoming WhatsApp conversations and webhook events from Meta</li>
<li>Generate AI-assisted responses according to your configuration</li>
<li>Manage WhatsApp Business phone numbers, templates, and messaging configuration you authorize</li>
<li>Keep conversation history, transcripts, outcomes, and message status where the product stores them</li>
<li>Run calendars, CRM updates, and other tools you enable</li>
<li>Send demo verification codes and product email, such as invites and password resets</li>
<li>Authenticate users and secure accounts</li>
<li>Provide logs, cost snapshots, and operational monitoring</li>
<li>Troubleshoot and improve reliability</li>
<li>Prevent abuse, fraud, unauthorized access, and security incidents</li>
<li>Comply with applicable law</li>
</ul>
<p>We do not use information obtained through Meta or WhatsApp for purposes unrelated to the functionality you have authorized.</p>
</section>
<section id="meta"><h2>3. Meta and WhatsApp permissions</h2>
<p>Speeko may request Meta permissions that are necessary for WhatsApp. We use each permission only for the WhatsApp features you authorize.</p>
<h3><code>whatsapp_business_messaging</code></h3>
<p>This permission allows Speeko to send and receive WhatsApp messages and perform messaging operations for WhatsApp Business phone numbers you have authorized. We use it to:</p>
<ul>
<li>Receive WhatsApp messages through Meta webhooks</li>
<li>Send responses from your configured business account</li>
<li>Send approved WhatsApp message templates where Meta requires a template</li>
<li>Process message status and related messaging events</li>
<li>Handle media associated with WhatsApp messages where that feature is supported</li>
</ul>
<h3><code>whatsapp_business_management</code></h3>
<p>This permission allows Speeko to access and manage WhatsApp Business assets you authorize. Depending on your configuration, this may include:</p>
<ul>
<li>WhatsApp Business Accounts</li>
<li>Business phone numbers</li>
<li>Message templates</li>
<li>WhatsApp business profile information</li>
<li>WhatsApp webhook subscriptions and configuration</li>
</ul>
<h3><code>business_management</code></h3>
<p>This permission may allow Speeko to access business assets or business portfolio information needed to complete WhatsApp onboarding. We use it only to connect and operate the WhatsApp Business assets you authorize. We do not use it to access unrelated advertising, marketing, or business information.</p>
<h3><code>public_profile</code></h3>
<p>This permission provides basic public profile information Meta makes available, so we can identify the person who connects a Meta account to Speeko. We use it only for account identification and the integration.</p>
</section>
<section id="whatsapp"><h2>4. How we process WhatsApp messages</h2>
<p>When you connect a WhatsApp Business Account, Meta may send webhook events to our servers. For example, when a customer messages your connected WhatsApp Business number:</p>
<ol>
<li>Meta sends the webhook event to Speeko.</li>
<li>Speeko stores the event and matches it to your organization when the phone number id or WABA id is known.</li>
<li>If you have enabled an agent or automation for that number, Speeko processes the message according to that configuration. Our AI system may read the message to choose a response or action.</li>
<li>Speeko may send the resulting response through the WhatsApp Business Platform.</li>
<li>Message and delivery information may be kept for operation, debugging, or conversation history, according to your account and this policy.</li>
</ol>
<p>Outside Meta’s customer service window, a business-initiated WhatsApp message has to be an approved template. Speeko does not use WhatsApp content for advertising profiles.</p>
</section>
<section id="ai"><h2>5. Voice and AI processing</h2>
<p>Speeko provides AI automation. Depending on what you configure, call audio, transcripts, WhatsApp messages, conversation context, and your instructions may be processed by the speech and language-model providers selected for that agent. Those providers produce the transcript or the reply for that session. They can include LiveKit Inference and, when you select them, providers such as Google, OpenAI, xAI, Deepgram, Inworld, or Sarvam.</p>
<p>That processing is used to:</p>
<ul>
<li>Hear and speak on a live call</li>
<li>Generate responses</li>
<li>Understand an incoming request</li>
<li>Run the workflow you selected</li>
<li>Extract information from the conversation</li>
<li>Update connected business systems</li>
<li>Take actions you configured</li>
</ul>
<p>We do not use your WhatsApp messages or call transcripts to train Speeko’s own general-purpose AI models unless we separately obtain appropriate authorization to do so. Provider processing for a live session is separate from that, and follows that provider’s terms.</p>
</section>
<section id="sharing"><h2>6. Information sharing</h2>
<p>We share information with service providers that help us operate Speeko, including:</p>
<ul>
<li>Cloud hosting and infrastructure</li>
<li>Database and storage</li>
<li>Speech, transcription, and language-model processing</li>
<li>Telephony and WhatsApp messaging infrastructure, including Meta</li>
<li>Email delivery</li>
<li>Authentication</li>
<li>Monitoring and security</li>
<li>Analytics on the marketing site</li>
<li>Customer support</li>
<li>Calendar, CRM, and other systems you connect</li>
</ul>
<p>These providers may process information only as needed to provide their service to Speeko, under contract or confidentiality obligations appropriate to that service.</p>
<p>We may also disclose information when required by law or legal process, or to protect the rights, security, and property of Speeko, our users, or others.</p>
<p>We do not sell WhatsApp or Meta Platform data.</p>
<p>We do not use Meta Platform data for unrelated advertising or profiling.</p>
</section>
<section id="retention"><h2>7. Data retention</h2>
<p>We keep information for as long as reasonably needed to provide the services, maintain security, comply with law, resolve disputes, and enforce our agreements. How long that is depends on the type of information and how the account is configured.</p>
<p>One-time demo codes expire within minutes. Unused verification tokens expire shortly after. Call transcripts and WhatsApp webhook events remain with the account until deleted under this policy or a valid deletion request.</p>
</section>
<section id="security"><h2>8. Data security</h2>
<p>We use reasonable technical and organizational measures designed to protect information against unauthorized access, alteration, disclosure, or destruction. These measures include:</p>
<ul>
<li>Access controls</li>
<li>Authentication and authorization</li>
<li>Encryption in transit</li>
<li>Restricted handling of credentials: password hashes, hashed webhook verify tokens, and integration secrets that are not shown again after you save them</li>
<li>Logging and monitoring</li>
<li>Infrastructure security controls</li>
<li>Restricted access to production systems</li>
</ul>
<p>No method of transmission or storage is completely secure. We cannot guarantee absolute security.</p>
</section>
<section id="rights"><h2>9. Your rights and choices</h2>
<p>Depending on where you live and which law applies, you may have the right to:</p>
<ul>
<li>Request access to information we hold about you</li>
<li>Request correction of inaccurate information</li>
<li>Request deletion of your information</li>
<li>Request restriction of certain processing</li>
<li>Object to certain processing</li>
<li>Withdraw authorization for a connected integration</li>
</ul>
<p>You can disconnect Speeko from your Meta account in Meta’s business integration settings. Disconnecting stops Speeko from receiving new information through that authorization. Information already received may remain until it is deleted under our retention practices or a valid deletion request.</p>
<p>If a business contacted you through Speeko, contact that business about the conversation. You may also write to us, and we will help where we hold the data.</p>
</section>
<section id="deletion"><h2>10. Data deletion</h2>
<p>You may request deletion of your Speeko account and information associated with it.</p>
<p>Email <a href="${MAILTO}">${PRIVACY_EMAIL}</a> with:</p>
<ul>
<li>Your name</li>
<li>The email address on the Speeko account</li>
<li>Company or organization name, if you have one</li>
<li>What you want deleted</li>
</ul>
<p>We will verify the request and process eligible deletions in line with applicable law and our retention requirements. Where it applies, deletion may include:</p>
<ul>
<li>Speeko account information</li>
<li>Connected Meta and WhatsApp identifiers</li>
<li>Stored access credentials or tokens</li>
<li>WhatsApp conversation data stored by Speeko</li>
<li>Message metadata and stored webhook events</li>
<li>Call transcripts and outcomes stored for that account</li>
<li>Configuration for the connected WhatsApp integration</li>
</ul>
<p>Some information may be retained where the law requires it, for security, or for legitimate business records.</p>
</section>
<section id="disconnect"><h2>11. Disconnecting WhatsApp</h2>
<p>You may disconnect your WhatsApp Business integration from Speeko at any time.</p>
<p>After disconnection, Speeko will no longer use that authorization to access your WhatsApp Business resources, except where we still have to handle information already received, or where the law requires it. You may also revoke the permissions in Meta’s business settings.</p>
</section>
<section id="children"><h2>12. Children’s privacy</h2>
<p>Speeko is for businesses. It is not directed at children. We do not knowingly collect personal information from children in violation of applicable law.</p>
</section>
<section id="transfers"><h2>13. International data transfers</h2>
<p>Speeko and its service providers may process information in the United States and in other countries where those providers operate, which may not be the country where you live. Where the law requires it, we use appropriate safeguards for those transfers.</p>
</section>
<section id="changes"><h2>14. Changes to this policy</h2>
<p>We may update this policy from time to time. When we do, we will change the “Last updated” date at the top. Where the law requires it, we will give additional notice of material changes.</p>
</section>
<section id="contact"><h2>15. Contact us</h2>
<p>Questions about this policy, our data practices, or a deletion request can go to:</p>
<div class="pp-contact">
<p class="pp-contact-name">Speeko AI</p>
<p>Website: <a href="https://speeko.ai">https://speeko.ai</a></p>
<p>Email: <a href="${MAILTO}">${PRIVACY_EMAIL}</a></p>
</div>
<p class="pp-disclaimer">Speeko is an independent software service. It is not affiliated with, endorsed by, sponsored by, or otherwise officially connected with Meta Platforms, Inc. or WhatsApp LLC. WhatsApp and Meta are trademarks of their respective owners.</p>
</section>`;
}

/** Visible document for clients that do not run JavaScript. React replaces #root. */
export function privacyCrawlerRootHtml(): string {
  return `<main>
<h1>Privacy Policy</h1>
<p>Last updated ${PRIVACY_UPDATED}</p>
<p>Speeko AI (“Speeko”, “we”, “our”, or “us”) provides AI voice agents and messaging automation for businesses. This policy explains how we collect, use, store, and protect information when you use our website, portal, APIs, and integrations, including Meta WhatsApp.</p>
<article>${privacyArticleHtml()}</article>
</main>`;
}
