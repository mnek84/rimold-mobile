/**
 * "Actualizado hoy 14:32" / "Actualizado 10/11 14:32" a partir del
 * `last_status_at` del backend (cuándo entró al estado actual, según el hito,
 * no la última escritura de la fila). `null` si el backend no lo mandó.
 *
 * Pura (sin RN) para poder probarla con `node --test`.
 */
export function formatLastUpdate(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (iso == null || iso === '') return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();

  return sameDay ? `Actualizado hoy ${time}` : `Actualizado ${pad(at.getDate())}/${pad(at.getMonth() + 1)} ${time}`;
}
