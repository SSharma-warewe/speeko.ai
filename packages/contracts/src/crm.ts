/** Explicit commands; the browser cannot choose arbitrary HighLevel URLs. */
export const CRM_ACTIONS = [
  'contacts.list',
  'contacts.get',
  'contacts.create',
  'contacts.update',
  'contacts.delete',
  'notes.list',
  'notes.create',
  'notes.update',
  'notes.delete',
  'tasks.list',
  'tasks.create',
  'tasks.update',
  'tasks.delete',
  'calendars.list',
  'events.list',
  'events.create',
  'events.update',
  'events.delete',
  'slots.list',
  'pipelines.list',
  'opportunities.list',
  'opportunities.create',
  'opportunities.update',
  'opportunities.delete',
  'conversations.list',
  'messages.list',
  'messages.send',
  'workflows.list',
  'workflows.enroll',
  'workflows.remove',
  'tags.list',
  'fields.list',
  'users.list',
] as const;
export type CrmAction = (typeof CRM_ACTIONS)[number];
export type CrmCommand = {
  action: CrmAction;
  /** Action-specific, strictly validated parameters. Location always comes from the connection. */
  params?: Record<string, unknown>;
};
export type CrmResult = Record<string, unknown>;
export const CRM_SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'calendars.readonly',
  'calendars/events.readonly',
  'calendars/events.write',
  'opportunities.readonly',
  'opportunities.write',
  'conversations.readonly',
  'conversations/message.readonly',
  'conversations/message.write',
  'workflows.readonly',
  'locations/tags.readonly',
  'locations/customFields.readonly',
  'users.readonly',
] as const;
