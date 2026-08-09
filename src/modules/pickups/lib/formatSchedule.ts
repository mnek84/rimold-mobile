/**
 * Helpers de formato de fecha/hora para las screens de pickup en la app del chofer.
 * Todos los formatos son es-AR.
 */

function parseIsoDate(iso: string): Date | null {
  // Aceptamos 'YYYY-MM-DD' o ISO completo. Construimos con partes para evitar
  // el corrimiento por timezone de Date(iso) con 'YYYY-MM-DD' en algunos motores.
  const dateOnly = iso.slice(0, 10);
  const [y, m, d] = dateOnly.split('-').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** "10/08" para el header de tarjetas compactas. */
export function formatShortDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** "Vie 10 ago" para subtítulos legibles. */
export function formatShortWeekday(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  try {
    const out = new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .format(d)
      .replace(/\./g, '');
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch {
    return iso;
  }
}

/** "09:00 – 13:00", "09:00", o vacío si no hay horario. Recorta segundos. */
export function formatTimeRange(from: string | null, to: string | null): string {
  const clean = (s: string | null): string | null => {
    if (s == null || s === '') return null;
    return s.length >= 5 ? s.slice(0, 5) : s;
  };
  const f = clean(from);
  const t = clean(to);
  if (f && t) return `${f} – ${t}`;
  return f ?? '';
}
