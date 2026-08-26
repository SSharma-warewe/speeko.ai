import {
  isErrorCode,
  KNOWN_TASK_KEYS,
  KNOWN_TOOL_IDS,
  type ErrorCode,
} from "@call-agent/contracts";
import type {
  AdminProfile,
  AdminQueueStats,
  Agent,
  AgentPrompt,
  AssignOrganizationAgentRequest,
  CallBatch,
  CallCostLine,
  CallCostSnapshot,
  CallRecord,
  ChangePasswordRequest,
  CloneOrganizationAgentRequest,
  CostSummary,
  CreateInboundSipTrunkRequest,
  CreateIntegrationEndpointRequest,
  CreateOrgUserRequest,
  CreateOrganizationIntegrationRequest,
  CreateOrganizationRequest,
  CreateOutboundSipTrunkRequest,
  CreateSipDispatchRuleRequest,
  CreateToolProfileRequest,
  CreateUserOutboundCallRequest,
  CreateUserTestCallRequest,
  EnqueueCallsRequest,
  EnqueueCallsResponse,
  GhlCalendarOption,
  InboundPublishResult,
  IntegrationEndpoint,
  IntegrationEndpointSecret,
  IntegrationProvider,
  KnownToolId,
  KnownToolsResponse,
  ListCallsQuery,
  OrganizationToolsResponse,
  UpdateOrganizationToolsRequest,
  OrgQueueStats,
  OrgUser,
  Organization,
  OrganizationIntegration,
  OrganizationIntegrationTestResponse,
  PreviewGhlCalendarsRequest,
  PreviewGhlCalendarsResponse,
  PublishInboundRequest,
  PublishResourceResult,
  QueueSettings,
  ResetAdminPasswordRequest,
  ResetUserPasswordRequest,
  SetPasswordRequest,
  SipDispatchRule,
  SipDispatchRuleType,
  SipTrunk,
  TestCallResponse,
  TokenResponse,
  ToolProfile,
  UpdateAgentTemplateRequest,
  UpdateInboundSipTrunkRequest,
  UpdateIntegrationEndpointRequest,
  UpdateOrganizationAgentRequest,
  UpdateOrganizationIntegrationRequest,
  UpdateOutboundSipTrunkRequest,
  UpdateProfileRequest,
  UpdateQueueSettingsRequest,
  UpdateSipDispatchRuleRequest,
  UpdateToolProfileRequest,
  UserCallBucket,
  UserProfile,
} from "@call-agent/contracts";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export const ADMIN_TOKEN_KEY = "callagent_admin_token";
export const USER_TOKEN_KEY = "callagent_user_token";

/** Known LiveKit task keys for dropdowns */
export const TASK_KEYS = KNOWN_TASK_KEYS;
export { KNOWN_TOOL_IDS };
export type {
  AdminProfile,
  AdminQueueStats,
  Agent,
  AgentPrompt,
  CallBatch,
  CallCostLine,
  CallCostSnapshot,
  CallRecord,
  CostSummary,
  EnqueueCallsResponse,
  GhlCalendarOption,
  InboundPublishResult,
  IntegrationEndpoint,
  IntegrationEndpointSecret,
  IntegrationProvider,
  KnownToolId,
  OrgQueueStats,
  OrgUser,
  Organization,
  OrganizationIntegration,
  PublishResourceResult,
  QueueSettings,
  SipDispatchRule,
  SipDispatchRuleType,
  SipTrunk,
  TestCallResponse,
  TokenResponse,
  ToolProfile,
  UserCallBucket,
  UserProfile,
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: ErrorCode,
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

export class NotFoundError extends ApiError {
  constructor(message = "Not found", code?: ErrorCode) {
    super(message, 404, code);
    this.name = "NotFoundError";
  }
}

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
  checkGhlFreeSlots:
    "GHL open slots only — requires agent GHL calendar link (hides existing meetings)",
  lookupGhlContact:
    "GHL look up contact by email/phone — requires agent GHL calendar link and contacts.readonly; stores ghlContactId when found",
  upsertGhlContact:
    "GHL create/update contact — requires agent GHL calendar link and contacts.write on the PIT; stores ghlContactId for booking",
  scheduleGhlMeeting:
    "GHL book a meeting — requires agent GHL calendar link and a GHL contact id (from lookupGhlContact, upsertGhlContact, or call context). Never pass a phone as contactId.",
};

function parseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && message.length > 0) {
    return message.map(String).join(", ");
  }
  return fallback;
}

function parseErrorCode(body: unknown): ErrorCode | undefined {
  if (!body || typeof body !== "object") return undefined;
  const code = (body as { code?: unknown }).code;
  return isErrorCode(code) ? code : undefined;
}

function throwForFailedResponse(status: number, body: unknown, fallback: string): never {
  const message = parseErrorMessage(body, fallback);
  const code = parseErrorCode(body);
  if (status === 404) {
    throw new NotFoundError(message, code);
  }
  throw new ApiError(message, status, code);
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
    throwForFailedResponse(
      res.status,
      body,
      "Login failed. Check your credentials.",
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
    throwForFailedResponse(res.status, body, `Request failed (${res.status})`);
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

export const createOrganization = (data: CreateOrganizationRequest) =>
  adminFetch<Organization>("/admin/organizations", {
    method: "POST",
    body: data,
  });

/* ── Users ── */
export const listOrgUsers = (orgId: string) =>
  adminFetch<OrgUser[]>(`/admin/organizations/${orgId}/users`);

export const createOrgUser = (orgId: string, data: CreateOrgUserRequest) =>
  adminFetch<OrgUser>(`/admin/organizations/${orgId}/users`, {
    method: "POST",
    body: data,
  });

export const resendOrgUserInvite = (orgId: string, userId: string) =>
  adminFetch<{ ok: true }>(`/admin/organizations/${orgId}/users/${userId}/invite`, {
    method: "POST",
  });

export const changeAdminPassword = (data: ChangePasswordRequest) =>
  adminFetch<{ ok: true }>("/auth/admin/password", {
    method: "POST",
    body: data,
  });

export const changeUserPassword = (data: ChangePasswordRequest) =>
  userFetch<{ ok: true }>("/auth/password", {
    method: "POST",
    body: data,
  });

export const updateUserProfile = (data: UpdateProfileRequest) =>
  userFetch<UserProfile>("/auth/me", {
    method: "PATCH",
    body: data,
  });

export const updateAdminProfile = (data: UpdateProfileRequest) =>
  adminFetch<AdminProfile>("/auth/admin/me", {
    method: "PATCH",
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
    throwForFailedResponse(res.status, parsed, fallbackError);
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

export const setUserPassword = (data: SetPasswordRequest) =>
  publicJson<{ ok: true }>("/auth/set-password", data, "Could not set password.");

export const resetUserPassword = (data: ResetUserPasswordRequest) =>
  publicJson<{ ok: true }>(
    "/auth/reset-password",
    data,
    "Could not reset password.",
  );

export const resetAdminPassword = (data: ResetAdminPasswordRequest) =>
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
  data: UpdateAgentTemplateRequest,
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
  data: AssignOrganizationAgentRequest,
) =>
  adminFetch<Agent>(`/admin/organizations/${orgId}/agents`, {
    method: "POST",
    body: data,
  });

export const cloneOrgAgent = (
  orgId: string,
  id: string,
  data: CloneOrganizationAgentRequest,
) =>
  adminFetch<Agent>(`/admin/organizations/${orgId}/agents/${id}/clone`, {
    method: "POST",
    body: data,
  });

export const updateOrgAgent = (
  orgId: string,
  id: string,
  data: UpdateOrganizationAgentRequest,
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
  data: CreateOutboundSipTrunkRequest,
) =>
  adminFetch<SipTrunk>(`/admin/organizations/${orgId}/sip-trunks`, {
    method: "POST",
    body: data,
  });

export const updateSipTrunk = (
  orgId: string,
  id: string,
  data: UpdateOutboundSipTrunkRequest,
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

export const listAdminKnownTools = () =>
  adminFetch<KnownToolsResponse>("/admin/tool-profiles/known-tools");

export const getOrgAssignedTools = (orgId: string) =>
  adminFetch<OrganizationToolsResponse>(
    `/admin/organizations/${orgId}/tools`,
  );

export const updateOrgAssignedTools = (
  orgId: string,
  data: UpdateOrganizationToolsRequest,
) =>
  adminFetch<OrganizationToolsResponse>(
    `/admin/organizations/${orgId}/tools`,
    { method: "PATCH", body: data },
  );

export const getToolProfile = (id: string) =>
  adminFetch<ToolProfile>(`/admin/tool-profiles/${id}`);

export const createToolProfile = (data: CreateToolProfileRequest) =>
  adminFetch<ToolProfile>("/admin/tool-profiles", {
    method: "POST",
    body: data,
  });

export const updateToolProfile = (
  id: string,
  data: UpdateToolProfileRequest,
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

export const getAdminCostSummary = (opts?: {
  organizationId?: string;
  from?: string;
  to?: string;
}) => {
  const q = new URLSearchParams();
  if (opts?.organizationId) q.set("organizationId", opts.organizationId);
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  const qs = q.toString();
  return adminFetch<CostSummary>(
    `/admin/costs/summary${qs ? `?${qs}` : ""}`,
  );
};

/* ── Queue ── */
export const getAdminQueueStats = () =>
  adminFetch<AdminQueueStats>("/admin/queue/stats");

export const getOrgQueueSettings = (orgId: string) =>
  adminFetch<QueueSettings>(`/admin/organizations/${orgId}/queue/settings`);

export const updateOrgQueueSettings = (
  orgId: string,
  data: UpdateQueueSettingsRequest,
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
    throwForFailedResponse(
      res.status,
      body,
      "Login failed. Check org slug and credentials.",
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
    throwForFailedResponse(res.status, body, `Request failed (${res.status})`);
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

export const createUserAgent = (data: AssignOrganizationAgentRequest) =>
  userFetch<Agent>("/users/agents", {
    method: "POST",
    body: data,
  });

export const cloneUserAgent = (
  id: string,
  data: CloneOrganizationAgentRequest,
) =>
  userFetch<Agent>(`/users/agents/${id}/clone`, {
    method: "POST",
    body: data,
  });

export const updateUserAgent = (
  id: string,
  data: UpdateOrganizationAgentRequest,
) =>
  userFetch<Agent>(`/users/agents/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserAgent = (id: string) =>
  userFetch<void>(`/users/agents/${id}`, { method: "DELETE" });

/* ── User org integrations (Nylas calendar, etc.) ── */
export const listUserOrgIntegrations = () =>
  userFetch<OrganizationIntegration[]>("/users/integrations");

export const createUserOrgIntegration = (
  data: CreateOrganizationIntegrationRequest,
) =>
  userFetch<OrganizationIntegration>("/users/integrations", {
    method: "POST",
    body: data,
  });

export const updateUserOrgIntegration = (
  id: string,
  data: UpdateOrganizationIntegrationRequest,
) =>
  userFetch<OrganizationIntegration>(`/users/integrations/${id}`, {
    method: "PATCH",
    body: data,
  });

export const deleteUserOrgIntegration = (id: string) =>
  userFetch<void>(`/users/integrations/${id}`, { method: "DELETE" });

export const testUserOrgIntegration = (id: string) =>
  userFetch<OrganizationIntegrationTestResponse>(
    `/users/integrations/${id}/test`,
    { method: "POST" },
  );

/** Unsaved GHL v3 PIT + location → GET /calendars/?locationId= */
export const previewGhlCalendars = (data: PreviewGhlCalendarsRequest) =>
  userFetch<PreviewGhlCalendarsResponse>("/users/integrations/ghl/calendars", {
    method: "POST",
    body: data,
  });

/* ── User tool profiles ── */
export const listUserToolProfiles = () =>
  userFetch<ToolProfile[]>("/users/tool-profiles");

export const getUserToolProfile = (id: string) =>
  userFetch<ToolProfile>(`/users/tool-profiles/${id}`);

export const listUserKnownTools = () =>
  userFetch<KnownToolsResponse>("/users/tool-profiles/known-tools");

export const createUserToolProfile = (data: CreateToolProfileRequest) =>
  userFetch<ToolProfile>("/users/tool-profiles", {
    method: "POST",
    body: data,
  });

export const updateUserToolProfile = (
  id: string,
  data: UpdateToolProfileRequest,
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

export const updateUserQueueSettings = (data: UpdateQueueSettingsRequest) =>
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
export const listUserCalls = (params?: ListCallsQuery) => {
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

export const getUserCostSummary = (opts?: { from?: string; to?: string }) => {
  const q = new URLSearchParams();
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  const qs = q.toString();
  return userFetch<CostSummary>(`/users/costs/summary${qs ? `?${qs}` : ""}`);
};

export const enqueueUserCalls = (data: EnqueueCallsRequest) =>
  userFetch<EnqueueCallsResponse>("/users/calls", {
    method: "POST",
    body: data,
  });

export const createUserOutboundCall = (data: CreateUserOutboundCallRequest) =>
  userFetch<CallRecord>("/users/calls/outbound", {
    method: "POST",
    body: data,
  });

export const createUserTestCall = (data: CreateUserTestCallRequest) =>
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

export const createUserOutboundTrunk = (data: CreateOutboundSipTrunkRequest) =>
  userFetch<SipTrunk>("/users/sip-trunks/outbound", {
    method: "POST",
    body: data,
  });

export const updateUserOutboundTrunk = (
  id: string,
  data: UpdateOutboundSipTrunkRequest,
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

export const createUserInboundTrunk = (data: CreateInboundSipTrunkRequest) =>
  userFetch<SipTrunk>("/users/sip-trunks/inbound", {
    method: "POST",
    body: data,
  });

export const updateUserInboundTrunk = (
  id: string,
  data: UpdateInboundSipTrunkRequest,
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

export const createUserDispatchRule = (data: CreateSipDispatchRuleRequest) =>
  userFetch<SipDispatchRule>("/users/sip-dispatch-rules", {
    method: "POST",
    body: data,
  });

export const updateUserDispatchRule = (
  id: string,
  data: UpdateSipDispatchRuleRequest,
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
export const publishUserInbound = (data?: PublishInboundRequest) =>
  userFetch<InboundPublishResult>("/users/inbound/publish", {
    method: "POST",
    body: data ?? {},
  });

/* ── User integration endpoints (CRM dial-in) ── */
export const listUserIntegrationEndpoints = () =>
  userFetch<IntegrationEndpoint[]>("/users/integration-endpoints");

export const getUserIntegrationEndpoint = (id: string) =>
  userFetch<IntegrationEndpoint>(`/users/integration-endpoints/${id}`);

export const createUserIntegrationEndpoint = (
  data: CreateIntegrationEndpointRequest,
) =>
  userFetch<IntegrationEndpointSecret>("/users/integration-endpoints", {
    method: "POST",
    body: data,
  });

export const updateUserIntegrationEndpoint = (
  id: string,
  data: UpdateIntegrationEndpointRequest,
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

