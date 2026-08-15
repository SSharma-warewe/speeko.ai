const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export const ADMIN_TOKEN_KEY = "callagent_admin_token";
export const USER_TOKEN_KEY = "callagent_user_token";

/** Known LiveKit task keys for dropdowns */
export const TASK_KEYS = [
  "general",
  "confirm_appointment",
  "lead_qualification",
  "customer_support",
  "survey",
  "debt_collection",
  "demo_booking",
] as const;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Session expired. Please log in again.") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  typ?: "admin";
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: "org_admin" | "agent" | "supervisor";
  isActive: boolean;
  organization: {
    id: string;
    name?: string;
    slug?: string;
  };
  typ?: "user";
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrgUser {
  id: string;
  organizationId: string;
  email: string;
  name: string | null;
  role: "org_admin" | "agent" | "supervisor";
  isActive: boolean;
  hasPassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPrompt {
  systemPrompt: string;
  /** null = built-in default; empty string = skip speech. */
  onEnterInstructions?: string | null;
  /** null = built-in default; empty string = skip speech. */
  onExitInstructions?: string | null;
}

export interface Agent {
  id: string;
  /** Platform template key (lineage). Prefer `slug` for org agent identity. */
  key: string;
  /** Display name (org-owned for organization agents). */
  name: string;
  /** Unique-per-org slug for organization agents. */
  slug?: string;
  direction: "inbound" | "outbound";
  description: string | null;
  isActive: boolean;
  prompt: AgentPrompt;
  defaultTaskKey: string;
  toolProfileId: string | null;
  /** Linked Nylas (org) calendar integration for calendar tools. */
  calendarIntegrationId?: string | null;
  enabledTools: string[];
  voice: string | null;
  model: string | null;
  temperature: number | null;
  organizationId?: string;
  agentId?: string;
  /** Platform template key on org agents (same as `key`). */
  templateKey?: string;
  createdAt: string;
  updatedAt: string;
}

/** Worker ToolRegistry ids (mirror apps/api/src/tools/known-tools.ts). */
export const KNOWN_TOOL_IDS = [
  "endCall",
  "booking",
  "cancelBooking",
  "transferCall",
  "lookupCustomer",
  "confirmAppointment",
  "checkCalendarAvailability",
  "listCalendarEvents",
  "createCalendarEvent",
  "cancelCalendarEvent",
  "checkGhlFreeSlots",
  "scheduleGhlMeeting",
] as const;

/** Optional short labels for tool profile UI. */
export const TOOL_ID_HINTS: Record<string, string> = {
  endCall: "Hang up the call",
  booking: "Stub booking (non-calendar)",
  cancelBooking: "Stub cancel booking",
  transferCall: "Transfer call",
  lookupCustomer: "Lookup customer",
  confirmAppointment: "Stub confirm appointment",
  checkCalendarAvailability:
    "Nylas free/busy — requires agent calendar link",
  listCalendarEvents: "Nylas list events — requires agent calendar link",
  createCalendarEvent: "Nylas create event — requires agent calendar link",
  cancelCalendarEvent: "Nylas cancel event — requires agent calendar link",
  checkGhlFreeSlots: "GHL open slots only (platform calendar, hides existing meetings)",
  scheduleGhlMeeting: "GHL book a meeting (platform calendar)",
};

export interface OrganizationIntegration {
  id: string;
  organizationId: string;
  provider: "nylas";
  name: string;
  apiKeyPrefix: string;
  grantId: string;
  calendarId: string;
  apiUri: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnownToolId = (typeof KNOWN_TOOL_IDS)[number];

export interface ToolProfile {
  id: string;
  key: string;
  name: string;
  description: string | null;
  organizationId?: string | null;
  isPlatform?: boolean;
  toolIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SipTrunk {
  id: string;
  organizationId: string;
  name: string;
  direction: "inbound" | "outbound";
  providerAddress: string | null;
  authUsername: string | null;
  numbers: string[];
  allowedNumbers: string[];
  allowedAddresses: string[];
  krispEnabled: boolean;
  livekitTrunkId: string | null;
  status: "draft" | "live";
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SipDispatchRuleType = "individual" | "direct" | "callee";

export interface SipDispatchRule {
  id: string;
  organizationId: string;
  name: string;
  ruleType: SipDispatchRuleType;
  roomPrefix: string | null;
  roomName: string | null;
  pin: string | null;
  randomize: boolean;
  sipTrunkIds: string[];
  hidePhoneNumber: boolean;
  attributes: Record<string, string> | null;
  metadata: string | null;
  organizationAgentId: string | null;
  agentName: string | null;
  livekitDispatchRuleId: string | null;
  status: "draft" | "live";
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishResourceResult {
  id: string;
  outcome: "published" | "skipped" | "failed";
  message?: string;
  livekitId?: string | null;
}

export interface InboundPublishResult {
  trunks: PublishResourceResult[];
  dispatchRules: PublishResourceResult[];
  publishedTrunks?: SipTrunk[];
  publishedDispatchRules?: SipDispatchRule[];
}

export interface CallRecord {
  id: string;
  organizationId: string | null;
  organizationAgentId: string | null;
  agentId: string | null;
  sipTrunkId: string | null;
  batchId?: string | null;
  direction: "inbound" | "outbound";
  status: string;
  medium: "web" | "sip";
  roomName: string | null;
  participantIdentity: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  context?: Record<string, unknown> | null;
  taskKey: string | null;
  taskResult: Record<string, unknown> | null;
  transcript: Array<{
    role: string;
    content: string;
    createdAt?: string | number | null;
  }> | null;
  usage: Record<string, unknown> | null;
  /** LiveKit session report; may include toolEvents from worker complete. */
  sessionReport?: Record<string, unknown> | null;
  /**
   * Worker tool invocations (derived from sessionReport.toolEvents on the API).
   * Prefer this over digging into sessionReport in the portal.
   */
  toolEvents?: Array<{
    at?: string;
    toolId?: string;
    ok?: boolean;
    error?: string;
    summary?: string;
    durationMs?: number;
    args?: unknown;
    result?: unknown;
    [key: string]: unknown;
  }> | null;
  errorMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  priority?: number;
  lastFailureCode: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface TestCallResponse extends CallRecord {
  agentKey: string;
  livekitUrl: string;
  participantToken: string;
  meetUrl: string;
}

export interface EnqueueCallsResponse {
  batchId: string;
  count: number;
  calls: CallRecord[];
}

/** Preconfigured CRM dial-in endpoint (org user management). */
export interface IntegrationEndpoint {
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
}

/** Create / rotate response — full apiKey only once. */
export interface IntegrationEndpointSecret extends IntegrationEndpoint {
  apiKey: string;
}

export interface CallBatch {
  id: string;
  organizationId: string;
  status: "running" | "paused" | "cancelled" | "completed";
  organizationAgentId: string | null;
  sipTrunkId: string | null;
  taskKey: string | null;
  maxAttempts: number | null;
  maxConcurrent: number | null;
  priority: number;
  totalCount: number;
  pausedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: {
    pending: number;
    creating: number;
    dialing: number;
    ready: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
}

export interface QueueSettings {
  organizationId: string;
  enabled: boolean;
  paused: boolean;
  maxConcurrent: number;
  maxDialsPerMinute: number;
  defaultMaxAttempts: number;
  backoffStrategy: "fixed" | "exponential";
  backoffBaseSeconds: number;
  backoffMaxSeconds: number;
  retryOn: string[];
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string;
  claimBatchSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrgQueueStats {
  organizationId: string;
  queue: {
    enabled: boolean;
    paused: boolean;
    maxConcurrent: number;
    maxDialsPerMinute: number;
    inProgress: number;
    availableSlots: number;
    dialsLastMinute: number;
  };
  counts: {
    pending: number;
    pendingReadyNow: number;
    creating: number;
    dialing: number;
    ready: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  retries: { scheduled: number; avgAttemptCount: number };
  batches: { running: number; paused: number };
  dialer: {
    globalEnabled: boolean;
    lastTickAt: string | null;
    lastClaimCount: number;
    lastError: string | null;
  };
  daily: Array<{
    date: string;
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
  }>;
  asOf: string;
}

export interface AdminQueueStats {
  totals: {
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    cancelled: number;
    orgsEnabled: number;
    orgsPaused: number;
  };
  dialer: {
    globalEnabled: boolean;
    lastTickAt: string | null;
    lastClaimCount: number;
    lastError: string | null;
  };
  organizations: OrgQueueStats[];
  asOf: string;
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && message.length > 0) {
    return message.map(String).join(", ");
  }
  return fallback;
}

export function getStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // ignore private mode / quota
  }
}

export function clearStoredAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Could not reach the API. Is it running?");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON
  }

  if (!res.ok) {
    throw new ApiError(
      parseErrorMessage(body, "Login failed. Check your credentials."),
      res.status,
    );
  }

  const token = body as TokenResponse;
  if (!token?.access_token) {
    throw new Error("Login response missing access_token.");
  }

  setStoredAdminToken(token.access_token);
  return token;
}

type AdminFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

export async function adminFetch<T>(
  path: string,
  options: AdminFetchOptions = {},
): Promise<T> {
  const token = options.token ?? getStoredAdminToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      headers,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the API. Is it running?", 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (res.status === 401) {
    clearStoredAdminToken();
    throw new UnauthorizedError(parseErrorMessage(body, "Unauthorized"));
  }

  if (!res.ok) {
    throw new ApiError(
      parseErrorMessage(body, `Request failed (${res.status})`),
      res.status,
    );
  }

  return body as T;
}

/* ── Auth ── */
export const getAdminMe = () => adminFetch<AdminProfile>("/auth/admin/me");

/* ── Organizations ── */
export const listOrganizations = () =>
  adminFetch<Organization[]>("/admin/organizations");

export const getOrganization = (id: string) =>
  adminFetch<Organization>(`/admin/organizations/${id}`);

export const createOrganization = (data: { name: string; slug: string }) =>
  adminFetch<Organization>("/admin/organizations", {
    method: "POST",
    body: data,
  });

/* ── Users ── */
export const listOrgUsers = (orgId: string) =>
  adminFetch<OrgUser[]>(`/admin/organizations/${orgId}/users`);

export const createOrgUser = (
  orgId: string,
  data: {
    email: string;
    name?: string;
    role?: OrgUser["role"];
  },
) =>
  adminFetch<OrgUser>(`/admin/organizations/${orgId}/users`, {
    method: "POST",
    body: data,
  });

export const resendOrgUserInvite = (orgId: string, userId: string) =>
  adminFetch<{ ok: true }>(`/admin/organizations/${orgId}/users/${userId}/invite`, {
    method: "POST",
  });

export const changeAdminPassword = (data: {
  currentPassword: string;
  newPassword: string;
}) =>
  adminFetch<{ ok: true }>("/auth/admin/password", {
    method: "POST",
    body: data,
  });

export const changeUserPassword = (data: {
  currentPassword: string;
  newPassword: string;
}) =>
  userFetch<{ ok: true }>("/auth/password", {
    method: "POST",
    body: data,
  });

export async function publicJson<T>(
  path: string,
  body: unknown,
  fallbackError: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the API. Is it running?", 0);
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // non-JSON
  }

  if (!res.ok) {
    throw new ApiError(parseErrorMessage(parsed, fallbackError), res.status);
  }
  return parsed as T;
}

export const forgotUserPassword = (email: string, organizationSlug: string) =>
  publicJson<{ ok: true }>(
    "/auth/forgot-password",
    { email, organizationSlug },
    "Could not send reset email.",
  );

export const forgotAdminPassword = (email: string) =>
  publicJson<{ ok: true }>(
    "/auth/admin/forgot-password",
    { email },
    "Could not send reset email.",
  );

export const setUserPassword = (data: {
  email: string;
  organizationSlug: string;
  token: string;
  newPassword: string;
}) =>
  publicJson<{ ok: true }>("/auth/set-password", data, "Could not set password.");

export const resetUserPassword = (data: {
  email: string;
  organizationSlug: string;
  token: string;
  newPassword: string;
}) =>
  publicJson<{ ok: true }>(
    "/auth/reset-password",
    data,
    "Could not reset password.",
  );

export const resetAdminPassword = (data: {
  email: string;
  token: string;
  newPassword: string;
}) =>
  publicJson<{ ok: true }>(
    "/auth/admin/reset-password",
    data,
    "Could not reset password.",
  );

/* ── Platform agents ── */
export const listAgentTemplates = () => adminFetch<Agent[]>("/admin/agents");

export const getAgentTemplate = (id: string) =>
  adminFetch<Agent>(`/admin/agents/${id}`);

export const updateAgentTemplate = (
  id: string,
  data: {
    systemPrompt?: string;
    onEnterInstructions?: string | null;
    onExitInstructions?: string | null;
    defaultTaskKey?: string;
    defaultToolProfileId?: string;
    voice?: string | null;
    model?: string | null;
    temperature?: number | null;
    isActive?: boolean;
  },
) =>
  adminFetch<Agent>(`/admin/agents/${id}`, {
    method: "PATCH",
    body: data,
  });

/* ── Org agents ── */
export const listOrgAgents = (orgId: string) =>
  adminFetch<Agent[]>(`/admin/organizations/${orgId}/agents`);

export const getOrgAgent = (orgId: string, id: string) =>
  adminFetch<Agent>(`/admin/organizations/${orgId}/agents/${id}`);

export const assignOrgAgent = (
  orgId: string,
  data: {
    agentId: string;
    name?: string;
    slug?: string;
    toolProfileId?: string;
    defaultTaskKey?: string;
  },
) =>
  adminFetch<Agent>(`/admin/organizations/${orgId}/agents`, {
    method: "POST",
    body: data,
  });

export const cloneOrgAgent = (
  orgId: string,
  id: string,
  data: { name: string; slug?: string },
) =>
  adminFetch<Agent>(`/admin/organizations/${orgId}/agents/${id}/clone`, {
    method: "POST",
    body: data,
  });

export const updateOrgAgent = (
  orgId: string,
  id: string,
  data: {
    name?: string;
    slug?: string;
    systemPrompt?: string;
    onEnterInstructions?: string | null;
    onExitInstructions?: string | null;
    toolProfileId?: string;
    defaultTaskKey?: string | null;
    voice?: string | null;
    model?: string | null;
    temperature?: number | null;
    isActive?: boolean;
  },
) =>
  adminFetch<Agent>(`/admin/organizations/${orgId}/agents/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteOrgAgent = (orgId: string, id: string) =>
  adminFetch<void>(`/admin/organizations/${orgId}/agents/${id}`, {
    method: "DELETE",
  });

/* ── SIP trunks ── */
export const listSipTrunks = (orgId: string) =>
  adminFetch<SipTrunk[]>(`/admin/organizations/${orgId}/sip-trunks`);

export const getSipTrunk = (orgId: string, id: string) =>
  adminFetch<SipTrunk>(`/admin/organizations/${orgId}/sip-trunks/${id}`);

export const createSipTrunk = (
  orgId: string,
  data: {
    name: string;
    numbers: string[];
    livekitTrunkId?: string;
    providerAddress?: string;
    authUsername?: string;
    authPassword?: string;
    isActive?: boolean;
    destinationCountry?: string;
  },
) =>
  adminFetch<SipTrunk>(`/admin/organizations/${orgId}/sip-trunks`, {
    method: "POST",
    body: data,
  });

export const updateSipTrunk = (
  orgId: string,
  id: string,
  data: {
    name?: string;
    numbers?: string[];
    isActive?: boolean;
    authUsername?: string;
    authPassword?: string;
  },
) =>
  adminFetch<SipTrunk>(`/admin/organizations/${orgId}/sip-trunks/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteSipTrunk = (orgId: string, id: string) =>
  adminFetch<void>(`/admin/organizations/${orgId}/sip-trunks/${id}`, {
    method: "DELETE",
  });

/* ── Tool profiles ── */
export const listToolProfiles = () =>
  adminFetch<ToolProfile[]>("/admin/tool-profiles");

export const listOrgToolProfiles = (orgId: string) =>
  adminFetch<ToolProfile[]>(`/admin/organizations/${orgId}/tool-profiles`);

export const getToolProfile = (id: string) =>
  adminFetch<ToolProfile>(`/admin/tool-profiles/${id}`);

export const createToolProfile = (data: {
  name: string;
  key?: string;
  description?: string | null;
  toolIds: string[];
}) =>
  adminFetch<ToolProfile>("/admin/tool-profiles", {
    method: "POST",
    body: data,
  });

export const updateToolProfile = (
  id: string,
  data: {
    name?: string;
    description?: string | null;
    toolIds?: string[];
  },
) =>
  adminFetch<ToolProfile>(`/admin/tool-profiles/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteToolProfile = (id: string) =>
  adminFetch<void>(`/admin/tool-profiles/${id}`, { method: "DELETE" });

/* ── Calls ── */
export const listCalls = (limit = 50) =>
  adminFetch<CallRecord[]>(`/admin/calls?limit=${limit}`);

export const getCall = (id: string) =>
  adminFetch<CallRecord>(`/admin/calls/${id}`);

/* ── Queue ── */
export const getAdminQueueStats = () =>
  adminFetch<AdminQueueStats>("/admin/queue/stats");

export const getOrgQueueSettings = (orgId: string) =>
  adminFetch<QueueSettings>(`/admin/organizations/${orgId}/queue/settings`);

export const updateOrgQueueSettings = (
  orgId: string,
  data: Partial<
    Pick<
      QueueSettings,
      | "enabled"
      | "paused"
      | "maxConcurrent"
      | "maxDialsPerMinute"
      | "defaultMaxAttempts"
      | "backoffStrategy"
      | "backoffBaseSeconds"
      | "backoffMaxSeconds"
      | "retryOn"
      | "quietHoursEnabled"
      | "quietHoursStart"
      | "quietHoursEnd"
      | "quietHoursTimezone"
      | "claimBatchSize"
    >
  >,
) =>
  adminFetch<QueueSettings>(`/admin/organizations/${orgId}/queue/settings`, {
    method: "PATCH",
    body: data,
  });

export const pauseOrgQueue = (orgId: string) =>
  adminFetch<QueueSettings>(`/admin/organizations/${orgId}/queue/pause`, {
    method: "POST",
  });

export const resumeOrgQueue = (orgId: string) =>
  adminFetch<QueueSettings>(`/admin/organizations/${orgId}/queue/resume`, {
    method: "POST",
  });

export const getOrgQueueStats = (orgId: string) =>
  adminFetch<OrgQueueStats>(`/admin/organizations/${orgId}/queue/stats`);

/* ═══════════════════════════════════════════════════════════════════════════
 * Org-user API (JWT typ=user; org from token)
 * ═══════════════════════════════════════════════════════════════════════════ */

export function getStoredUserToken(): string | null {
  try {
    return localStorage.getItem(USER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredUserToken(token: string): void {
  try {
    localStorage.setItem(USER_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearStoredUserToken(): void {
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function userLogin(
  email: string,
  password: string,
  organizationSlug: string,
): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, organizationSlug }),
    });
  } catch {
    throw new Error("Could not reach the API. Is it running?");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON
  }

  if (!res.ok) {
    throw new ApiError(
      parseErrorMessage(body, "Login failed. Check org slug and credentials."),
      res.status,
    );
  }

  const token = body as TokenResponse;
  if (!token?.access_token) {
    throw new Error("Login response missing access_token.");
  }

  setStoredUserToken(token.access_token);
  return token;
}

type UserFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

export async function userFetch<T>(
  path: string,
  options: UserFetchOptions = {},
): Promise<T> {
  const token = options.token ?? getStoredUserToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      headers,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the API. Is it running?", 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (res.status === 401) {
    clearStoredUserToken();
    throw new UnauthorizedError(parseErrorMessage(body, "Unauthorized"));
  }

  if (!res.ok) {
    throw new ApiError(
      parseErrorMessage(body, `Request failed (${res.status})`),
      res.status,
    );
  }

  return body as T;
}

/* ── User auth ── */
export const getUserMe = () => userFetch<UserProfile>("/auth/me");

/* ── User agents ── */
export const listUserAgents = () => userFetch<Agent[]>("/users/agents");

export const listUserAgentTemplates = () =>
  userFetch<Agent[]>("/users/agent-templates");

export const getUserAgent = (id: string) =>
  userFetch<Agent>(`/users/agents/${id}`);

export const createUserAgent = (data: {
  agentId: string;
  name?: string;
  slug?: string;
  toolProfileId?: string;
  defaultTaskKey?: string;
}) =>
  userFetch<Agent>("/users/agents", {
    method: "POST",
    body: data,
  });

export const cloneUserAgent = (
  id: string,
  data: { name: string; slug?: string },
) =>
  userFetch<Agent>(`/users/agents/${id}/clone`, {
    method: "POST",
    body: data,
  });

export const updateUserAgent = (
  id: string,
  data: {
    name?: string;
    slug?: string;
    systemPrompt?: string;
    onEnterInstructions?: string | null;
    onExitInstructions?: string | null;
    toolProfileId?: string;
    calendarIntegrationId?: string | null;
    defaultTaskKey?: string | null;
    voice?: string | null;
    model?: string | null;
    temperature?: number | null;
    isActive?: boolean;
  },
) =>
  userFetch<Agent>(`/users/agents/${id}`, {
    method: "PATCH",
    body: data,
  });

/* ── User org integrations (Nylas calendar, etc.) ── */
export const listUserOrgIntegrations = () =>
  userFetch<OrganizationIntegration[]>("/users/integrations");

export const createUserOrgIntegration = (data: {
  name: string;
  provider?: "nylas";
  apiKey: string;
  grantId: string;
  calendarId?: string;
  apiUri?: string;
  email?: string;
}) =>
  userFetch<OrganizationIntegration>("/users/integrations", {
    method: "POST",
    body: data,
  });

export const updateUserOrgIntegration = (
  id: string,
  data: {
    name?: string;
    apiKey?: string;
    grantId?: string;
    calendarId?: string;
    apiUri?: string;
    email?: string | null;
    isActive?: boolean;
  },
) =>
  userFetch<OrganizationIntegration>(`/users/integrations/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserOrgIntegration = (id: string) =>
  userFetch<void>(`/users/integrations/${id}`, { method: "DELETE" });

export const testUserOrgIntegration = (id: string) =>
  userFetch<{ ok: boolean; message?: string; calendarIds?: string[] }>(
    `/users/integrations/${id}/test`,
    { method: "POST" },
  );

/* ── User tool profiles ── */
export const listUserToolProfiles = () =>
  userFetch<ToolProfile[]>("/users/tool-profiles");

export const getUserToolProfile = (id: string) =>
  userFetch<ToolProfile>(`/users/tool-profiles/${id}`);

export const listUserKnownTools = () =>
  userFetch<{ toolIds: string[] }>("/users/tool-profiles/known-tools");

export const createUserToolProfile = (data: {
  name: string;
  key?: string;
  description?: string | null;
  toolIds: string[];
}) =>
  userFetch<ToolProfile>("/users/tool-profiles", {
    method: "POST",
    body: data,
  });

export const updateUserToolProfile = (
  id: string,
  data: {
    name?: string;
    description?: string | null;
    toolIds?: string[];
  },
) =>
  userFetch<ToolProfile>(`/users/tool-profiles/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserToolProfile = (id: string) =>
  userFetch<void>(`/users/tool-profiles/${id}`, { method: "DELETE" });

/* ── User queue ── */
export const getUserQueueSettings = () =>
  userFetch<QueueSettings>("/users/queue/settings");

export const updateUserQueueSettings = (
  data: Partial<
    Pick<
      QueueSettings,
      | "enabled"
      | "paused"
      | "maxConcurrent"
      | "maxDialsPerMinute"
      | "defaultMaxAttempts"
      | "backoffStrategy"
      | "backoffBaseSeconds"
      | "backoffMaxSeconds"
      | "retryOn"
      | "quietHoursEnabled"
      | "quietHoursStart"
      | "quietHoursEnd"
      | "quietHoursTimezone"
      | "claimBatchSize"
    >
  >,
) =>
  userFetch<QueueSettings>("/users/queue/settings", {
    method: "PATCH",
    body: data,
  });

export const pauseUserQueue = () =>
  userFetch<QueueSettings>("/users/queue/pause", { method: "POST" });

export const resumeUserQueue = () =>
  userFetch<QueueSettings>("/users/queue/resume", { method: "POST" });

export const getUserQueueStats = () =>
  userFetch<OrgQueueStats>("/users/queue/stats");

export const listUserBatches = () =>
  userFetch<CallBatch[]>("/users/queue/batches");

export const getUserBatch = (id: string) =>
  userFetch<CallBatch>(`/users/queue/batches/${id}`);

export const pauseUserBatch = (id: string) =>
  userFetch<CallBatch>(`/users/queue/batches/${id}/pause`, { method: "POST" });

export const resumeUserBatch = (id: string) =>
  userFetch<CallBatch>(`/users/queue/batches/${id}/resume`, { method: "POST" });

export const cancelUserBatch = (id: string) =>
  userFetch<CallBatch>(`/users/queue/batches/${id}/cancel`, { method: "POST" });

/* ── User calls ── */
export type UserCallBucket = "pending" | "in_progress" | "done";

export const listUserCalls = (params?: {
  limit?: number;
  bucket?: UserCallBucket;
  status?: string;
  batchId?: string;
  direction?: "inbound" | "outbound";
}) => {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.bucket) q.set("bucket", params.bucket);
  if (params?.status) q.set("status", params.status);
  if (params?.batchId) q.set("batchId", params.batchId);
  if (params?.direction) q.set("direction", params.direction);
  const qs = q.toString();
  return userFetch<CallRecord[]>(`/users/calls${qs ? `?${qs}` : ""}`);
};

export const getUserCall = (id: string) =>
  userFetch<CallRecord>(`/users/calls/${id}`);

export const enqueueUserCalls = (data: {
  organizationAgentId: string;
  calls: Array<{ context: Record<string, unknown>; toNumber?: string }>;
  task?: string;
  sipTrunkId?: string;
  maxAttempts?: number;
  priority?: number;
  maxConcurrent?: number;
}) =>
  userFetch<EnqueueCallsResponse>("/users/calls", {
    method: "POST",
    body: data,
  });

export const createUserOutboundCall = (data: {
  organizationAgentId: string;
  context: Record<string, unknown>;
  task?: string;
  toNumber?: string;
  sipTrunkId?: string;
  waitUntilAnswered?: boolean;
}) =>
  userFetch<CallRecord>("/users/calls/outbound", {
    method: "POST",
    body: data,
  });

export const createUserTestCall = (data: {
  organizationAgentId: string;
  task?: string;
  context?: Record<string, unknown>;
}) =>
  userFetch<TestCallResponse>("/users/calls/test", {
    method: "POST",
    body: data,
  });

export const cancelUserCall = (id: string) =>
  userFetch<CallRecord>(`/users/calls/${id}/cancel`, { method: "POST" });

export const retryUserCall = (id: string) =>
  userFetch<CallRecord>(`/users/calls/${id}/retry`, { method: "POST" });

export const prioritizeUserCall = (id: string) =>
  userFetch<CallRecord>(`/users/calls/${id}/prioritize`, { method: "POST" });

/* ── User SIP outbound ── */
export const listUserOutboundTrunks = () =>
  userFetch<SipTrunk[]>("/users/sip-trunks/outbound");

export const getUserOutboundTrunk = (id: string) =>
  userFetch<SipTrunk>(`/users/sip-trunks/outbound/${id}`);

export const createUserOutboundTrunk = (data: {
  name: string;
  numbers: string[];
  livekitTrunkId?: string;
  providerAddress?: string;
  authUsername?: string;
  authPassword?: string;
  isActive?: boolean;
  destinationCountry?: string;
}) =>
  userFetch<SipTrunk>("/users/sip-trunks/outbound", {
    method: "POST",
    body: data,
  });

export const updateUserOutboundTrunk = (
  id: string,
  data: {
    name?: string;
    numbers?: string[];
    isActive?: boolean;
    authUsername?: string;
    authPassword?: string;
  },
) =>
  userFetch<SipTrunk>(`/users/sip-trunks/outbound/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserOutboundTrunk = (id: string) =>
  userFetch<void>(`/users/sip-trunks/outbound/${id}`, { method: "DELETE" });

/* ── User SIP inbound ── */
export const listUserInboundTrunks = () =>
  userFetch<SipTrunk[]>("/users/sip-trunks/inbound");

export const getUserInboundTrunk = (id: string) =>
  userFetch<SipTrunk>(`/users/sip-trunks/inbound/${id}`);

export const createUserInboundTrunk = (data: {
  name: string;
  numbers: string[];
  allowedNumbers?: string[];
  allowedAddresses?: string[];
  authUsername?: string;
  authPassword?: string;
  krispEnabled?: boolean;
  isActive?: boolean;
  livekitTrunkId?: string;
}) =>
  userFetch<SipTrunk>("/users/sip-trunks/inbound", {
    method: "POST",
    body: data,
  });

export const updateUserInboundTrunk = (
  id: string,
  data: {
    name?: string;
    numbers?: string[];
    allowedNumbers?: string[];
    allowedAddresses?: string[];
    authUsername?: string;
    authPassword?: string;
    krispEnabled?: boolean;
    isActive?: boolean;
  },
) =>
  userFetch<SipTrunk>(`/users/sip-trunks/inbound/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserInboundTrunk = (id: string) =>
  userFetch<void>(`/users/sip-trunks/inbound/${id}`, { method: "DELETE" });

export const publishUserInboundTrunk = (id: string) =>
  userFetch<SipTrunk>(`/users/sip-trunks/inbound/${id}/publish`, {
    method: "POST",
  });

/* ── User SIP dispatch rules ── */
export const listUserDispatchRules = () =>
  userFetch<SipDispatchRule[]>("/users/sip-dispatch-rules");

export const getUserDispatchRule = (id: string) =>
  userFetch<SipDispatchRule>(`/users/sip-dispatch-rules/${id}`);

export const createUserDispatchRule = (data: {
  name: string;
  ruleType?: SipDispatchRuleType;
  roomPrefix?: string;
  roomName?: string;
  pin?: string;
  randomize?: boolean;
  sipTrunkIds?: string[];
  hidePhoneNumber?: boolean;
  organizationAgentId?: string;
  agentName?: string;
  isActive?: boolean;
}) =>
  userFetch<SipDispatchRule>("/users/sip-dispatch-rules", {
    method: "POST",
    body: data,
  });

export const updateUserDispatchRule = (
  id: string,
  data: {
    name?: string;
    ruleType?: SipDispatchRuleType;
    roomPrefix?: string | null;
    roomName?: string | null;
    pin?: string | null;
    randomize?: boolean;
    sipTrunkIds?: string[];
    hidePhoneNumber?: boolean;
    organizationAgentId?: string | null;
    agentName?: string | null;
    isActive?: boolean;
  },
) =>
  userFetch<SipDispatchRule>(`/users/sip-dispatch-rules/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserDispatchRule = (id: string) =>
  userFetch<void>(`/users/sip-dispatch-rules/${id}`, { method: "DELETE" });

export const publishUserDispatchRule = (id: string) =>
  userFetch<SipDispatchRule>(`/users/sip-dispatch-rules/${id}/publish`, {
    method: "POST",
  });

/** Publish draft inbound trunks then dispatch rules (omit ids = all drafts). */
export const publishUserInbound = (data?: {
  sipTrunkIds?: string[];
  dispatchRuleIds?: string[];
}) =>
  userFetch<InboundPublishResult>("/users/inbound/publish", {
    method: "POST",
    body: data ?? {},
  });

/* ── User integration endpoints (CRM dial-in) ── */
export const listUserIntegrationEndpoints = () =>
  userFetch<IntegrationEndpoint[]>("/users/integration-endpoints");

export const getUserIntegrationEndpoint = (id: string) =>
  userFetch<IntegrationEndpoint>(`/users/integration-endpoints/${id}`);

export const createUserIntegrationEndpoint = (data: {
  name: string;
  organizationAgentId: string;
  task?: string;
  sipTrunkId?: string;
  maxAttempts?: number;
  priority?: number;
  maxConcurrent?: number;
  defaultContext?: Record<string, unknown>;
}) =>
  userFetch<IntegrationEndpointSecret>("/users/integration-endpoints", {
    method: "POST",
    body: data,
  });

export const updateUserIntegrationEndpoint = (
  id: string,
  data: {
    name?: string;
    organizationAgentId?: string;
    task?: string;
    sipTrunkId?: string | null;
    maxAttempts?: number | null;
    priority?: number;
    maxConcurrent?: number | null;
    defaultContext?: Record<string, unknown> | null;
    isActive?: boolean;
  },
) =>
  userFetch<IntegrationEndpoint>(`/users/integration-endpoints/${id}`, {
    method: "PATCH",
    body: data,
  });

export const rotateUserIntegrationEndpointKey = (id: string) =>
  userFetch<IntegrationEndpointSecret>(
    `/users/integration-endpoints/${id}/rotate-key`,
    { method: "POST" },
  );

export const deleteUserIntegrationEndpoint = (id: string) =>
  userFetch<void>(`/users/integration-endpoints/${id}`, { method: "DELETE" });

