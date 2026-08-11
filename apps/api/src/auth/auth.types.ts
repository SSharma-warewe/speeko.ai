export type JwtActorType = 'admin' | 'user';

export interface JwtPayload {
  sub: string;
  typ: JwtActorType;
  email: string;
  orgId?: string;
  role?: string;
}

export interface AuthAdminUser {
  id: string;
  email: string;
  name: string | null;
  typ: 'admin';
}

export interface AuthOrgUser {
  id: string;
  email: string;
  name: string | null;
  typ: 'user';
  orgId: string;
  role: string;
}

export type AuthPrincipal = AuthAdminUser | AuthOrgUser;
