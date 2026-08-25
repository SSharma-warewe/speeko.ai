export const UserRole = {
  ORG_ADMIN: 'org_admin',
  AGENT: 'agent',
  SUPERVISOR: 'supervisor',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
