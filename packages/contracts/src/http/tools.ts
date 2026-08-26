export type ToolProfile = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  organizationId?: string | null;
  isPlatform?: boolean;
  toolIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type KnownToolsResponse = {
  toolIds: string[];
};

/** Admin GET/PATCH /admin/organizations/:orgId/tools */
export type OrganizationToolsResponse = KnownToolsResponse;

export type UpdateOrganizationToolsRequest = {
  toolIds: string[];
};

export type CreateToolProfileRequest = {
  name: string;
  key?: string;
  description?: string | null;
  toolIds: string[];
};

export type UpdateToolProfileRequest = {
  name?: string;
  description?: string | null;
  toolIds?: string[];
};
