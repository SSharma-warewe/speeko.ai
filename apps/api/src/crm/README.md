# Live HighLevel CRM

The portal has a **CRM** tab at `/dashboard/integrations?tab=crm` and a **CRM** sidebar entry below WhatsApp at `/dashboard/crm`. A connection stores a sub-account Private Integration Token and location ID using `organization_integrations.provider=ghl_crm`. This is an additional value in the existing varchar field: no columns, tables, indexes, or foreign keys change. Multiple named CRM connections are supported, with explicit selection in CRM and WhatsApp contact import.

## Setup

In HighLevel sub-account Settings → Private Integrations, create a token. Copy the location ID from that sub-account's URL. Add both to Integrations → CRM. Open CRM; lists fetch live on entry, search, pagination, or Refresh. Saving writes directly to HighLevel. No local contact/event/deal mirror, webhook subscription, scheduled sync, or bulk import is created. The existing `ghl` agent-calendar and `ghl_contacts` integrations keep their behavior. CRM is not automatically linked to voice/WhatsApp agent tools; agent calendar setup and admin tool assignment still apply.

Enable only permissions for the needed modules (the portal displays this list):

- Contacts, notes, tasks, tags on contacts: `contacts.readonly`, `contacts.write`.
- Calendars and appointments: `calendars.readonly`, `calendars/events.readonly`, `calendars/events.write`.
- Pipelines and deals: `opportunities.readonly`, `opportunities.write`.
- Conversation history and SMS / HighLevel WhatsApp replies: `conversations.readonly`, `conversations/message.readonly`, `conversations/message.write`.
- Existing workflows and contact enrollment: `workflows.readonly`, `contacts.write`.
- Reference directory: `locations/tags.readonly`, `locations/customFields.readonly`, `users.readonly`.

“Test contacts access” verifies contact reads only. Modules load independently; a successful contact test does not imply every scope is present. API/token permissions, calendar availability, HighLevel channel configuration, DND, and the account's provider rules still apply. Workflow enrollment and calendar changes may trigger existing automations. HighLevel SMS/WhatsApp fees apply.

## Current coverage

- Contacts: paged search; create, edit, delete; tags and DND; address/company fields; edit text custom field values; inspect other field values.
- Contact notes and tasks: list, add, edit, delete; task due times/completion.
- Calendar: choose a calendar and up to 31 days; list appointments; check free times; book, edit/reschedule, cancel, delete appointments. Times use the browser's timezone and are sent with an explicit ISO offset/UTC instant. A free-time suggestion defaults to 30 minutes; the user can edit the duration, and HighLevel validates availability on save.
- Opportunities: paged deals in pipeline columns; create/edit/delete; change stage and status.
- Conversations: paged thread search, message history with older-page navigation, send SMS/HighLevel WhatsApp text. HTML email content is never rendered as HTML. Email sending is not part of this module.
- Workflows: list existing workflows; enroll/remove a selected contact. This does not implement a workflow designer.
- Directory: view location tags, custom field definitions, and team members. Definition/team editing, calendar configuration, payments/invoices, funnels/sites, campaigns, custom objects, and agency administration are not implemented here. This workspace covers CRM operations, not every HighLevel product surface.
- WhatsApp template sends: select an existing CRM connection as a live contact source, without entering another GHL token. Switching sources clears selected recipients and fences old reads.

## API and safety

`POST /api/users/crm/:integrationId/execute` accepts `{ action, params? }`. `CRM_ACTIONS` in `@call-agent/contracts` is the fixed command catalog. `crm.schemas.ts` strictly validates each parameter object, including nested mutation data; unknown properties, client locations/credentials/URLs, excessive page sizes/ranges, and path fragments are rejected. See the schemas for exact payloads. Standard org JWT/user guards apply. Secrets resolve using the JWT org; inactive, foreign, and wrong-provider connections are rejected. Resource reads validate location, and calendar/pipeline/workflow selection validates membership. Child note/task operations verify the parent contact and child membership before mutation.

HighLevel HTTP remains in `GhlService.crmRequest`. Contacts/calendar/conversations/reference routes pin the existing supported `2021-07-28` version. Opportunities use current `/v3` routes and `Version: v3`, with camelCase location filters, according to the current official docs. The service refuses redirects, uses explicit connection credentials with no platform fallback, applies a timeout, redacts reflected tokens, and never forwards upstream error bodies. Rate-limit errors remain 429. Token/scope failures remain 403 and do not log the portal user out. Mutations are never automatically retried: an ambiguous network result asks the user to refresh before retrying. There is no cross-system transaction or idempotency guarantee for manual repeated submissions.

## Official documentation reviewed

- [Authentication and private tokens](https://marketplace.gohighlevel.com/docs/Authorization/authorization_doc/)
- [Contacts and CRUD](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/contacts/)
- [Contact fields](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/create-contact/)
- [Tasks](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/create-task/)
- [Calendar events](https://marketplace.gohighlevel.com/docs/ghl/calendars/get-calendar-events/)
- [Create and edit appointments](https://marketplace.gohighlevel.com/docs/ghl/calendars/create-appointment/)
- [Current opportunity search](https://marketplace.gohighlevel.com/docs/ghl/opportunities/search-opportunity/)
- [Pipelines](https://marketplace.gohighlevel.com/docs/ghl/opportunities/get-pipelines/)
- [Conversation search](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/conversations/search-conversation/)
- [Messages](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/conversations/get-messages/)
- [Send message](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/conversations/send-a-new-message/)
- [Workflow enrollment](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/add-contact-to-workflow/)

## Verification

Run `npm run build:api`, `npm run build:portal`, and `npx jest --testPathPatterns="crm/test|ghl/test|organization-integrations/test|whatsapp-outbound/test" --runInBand --no-coverage` from the repository root. Tests mock HighLevel; they do not verify a live user's token, v3 endpoint availability, calendar configuration, or messaging provider setup. Exercise a test sub-account with the listed scopes before production rollout.
