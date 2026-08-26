export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  /**
   * Worker tool ids this org may enable.
   * `null`/omitted = grandfathered full catalog; new orgs get `["endCall"]`.
   */
  allowedToolIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrganizationRequest = {
  name: string;
  slug: string;
};
