export type AuthRole = 'DRIVER' | 'WAREHOUSE';

export type AuthUser = {
  id: string;
  role: AuthRole;
  /** Full role set for users that combine permissions (e.g., driver + warehouse). */
  roles: AuthRole[];
  /** Display name from API when available (employee or portal user). */
  name?: string;
};

export function getUserRoles(user: AuthUser | null | undefined): AuthRole[] {
  if (user == null) return [];
  if (Array.isArray((user as { roles?: AuthRole[] }).roles)) {
    return (user as { roles: AuthRole[] }).roles;
  }
  return [user.role];
}

export function hasRole(user: AuthUser | null | undefined, role: AuthRole): boolean {
  return getUserRoles(user).includes(role);
}
