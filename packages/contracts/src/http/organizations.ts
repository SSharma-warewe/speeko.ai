export type Organization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrganizationRequest = {
  name: string;
  slug: string;
};
