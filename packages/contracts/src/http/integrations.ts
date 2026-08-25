import type { IntegrationProvider } from '../integration.js';

export type OrganizationIntegration = {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  apiKeyPrefix: string;
  grantId: string | null;
  locationId: string | null;
  calendarId: string;
  apiUri: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrganizationIntegrationRequest = {
  name: string;
  provider?: IntegrationProvider;
  apiKey: string;
  grantId?: string;
  locationId?: string;
  calendarId?: string;
  apiUri?: string;
  email?: string;
};

export type UpdateOrganizationIntegrationRequest = {
  name?: string;
  apiKey?: string;
  grantId?: string;
  locationId?: string;
  calendarId?: string;
  apiUri?: string;
  email?: string | null;
  isActive?: boolean;
};

export type GhlCalendarOption = {
  id: string;
  name?: string;
};

export type OrganizationIntegrationTestResponse = {
  ok: boolean;
  message?: string;
  calendarIds?: string[];
  calendars?: GhlCalendarOption[];
};

export type PreviewGhlCalendarsRequest = {
  apiKey: string;
  locationId: string;
};

export type PreviewGhlCalendarsResponse = {
  ok: boolean;
  message?: string;
  calendars?: GhlCalendarOption[];
};

export type IntegrationEndpoint = {
  id: string;
  organizationId: string;
  name: string;
  publicId: string;
  organizationAgentId: string;
  taskKey: string;
  sipTrunkId: string | null;
  maxAttempts: number | null;
  priority: number;
  maxConcurrent: number | null;
  defaultContext: Record<string, unknown> | null;
  isActive: boolean;
  keyPrefix: string;
  endpointPath: string;
  lastUsedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationEndpointSecret = IntegrationEndpoint & {
  apiKey: string;
};

export type CreateIntegrationEndpointRequest = {
  name: string;
  organizationAgentId: string;
  task?: string;
  sipTrunkId?: string;
  maxAttempts?: number;
  priority?: number;
  maxConcurrent?: number;
  defaultContext?: Record<string, unknown>;
};

export type UpdateIntegrationEndpointRequest = {
  name?: string;
  organizationAgentId?: string;
  task?: string;
  sipTrunkId?: string | null;
  maxAttempts?: number | null;
  priority?: number;
  maxConcurrent?: number | null;
  defaultContext?: Record<string, unknown> | null;
  isActive?: boolean;
};
