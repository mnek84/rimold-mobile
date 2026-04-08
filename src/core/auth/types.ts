export type AuthRole = 'DRIVER' | 'WAREHOUSE';

export type AuthUser = {
  id: string;
  role: AuthRole;
  /** Display name from API when available (employee or portal user). */
  name?: string;
};
