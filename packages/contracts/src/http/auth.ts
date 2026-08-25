import type { UserRole } from '../user.js';

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: string;
};

export type OkResponse = {
  ok: true;
};

export type AdminProfile = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  typ?: 'admin';
};

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  organization: {
    id: string;
    name?: string;
    slug?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  typ?: 'user';
};

export type OrgUser = {
  id: string;
  organizationId: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  hasPassword?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpdateProfileRequest = {
  name: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type CreateOrgUserRequest = {
  email: string;
  name?: string;
  role?: UserRole;
};

export type SetPasswordRequest = {
  email: string;
  organizationSlug: string;
  token: string;
  newPassword: string;
};

export type ResetUserPasswordRequest = SetPasswordRequest;

export type ResetAdminPasswordRequest = {
  email: string;
  token: string;
  newPassword: string;
};
