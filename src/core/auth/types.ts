export type AuthRole = 'DRIVER' | 'WAREHOUSE' | 'WAREHOUSE_SUPERVISOR';

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

/**
 * Un supervisor de deposito tiene decisiones que el operario de piso no:
 * elegir chofer y autorizar la salida de una jaula incompleta.
 *
 * Ojo: esto solo decide que botones se ven. El gate real es el 403 del backend
 * — si se cambiara solo aca, un operario con el APK modificado pasaria igual.
 */
export function isWarehouseSupervisor(user: AuthUser | null | undefined): boolean {
  return hasRole(user, 'WAREHOUSE_SUPERVISOR');
}
