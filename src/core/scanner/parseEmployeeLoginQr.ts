const EMPLOYEE_LOGIN_TYPE = 'employee_login' as const;

export type EmployeeLoginQrPayload = {
  employee_id: string;
  secret: string;
};

/**
 * Parse raw QR string as JSON employee login payload. Returns null if invalid.
 * Does not persist anything.
 */
export function parseEmployeeLoginQr(raw: string): EmployeeLoginQrPayload | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;

  if (o.type !== EMPLOYEE_LOGIN_TYPE) return null;

  const employeeId = o.employee_id;
  const secret = o.secret;

  if (typeof employeeId !== 'string' || employeeId === '') return null;
  if (typeof secret !== 'string' || secret === '') return null;

  return { employee_id: employeeId, secret };
}
