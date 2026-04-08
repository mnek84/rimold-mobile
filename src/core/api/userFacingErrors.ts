import axios from 'axios';

/** Operational screens: no tokens, stack traces, or raw axios text. */
export function messageForShipmentListError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === 401) {
      return 'Sesión expirada o no válida. Volvé a iniciar sesión.';
    }
    const m = e.response?.data?.message;
    if (typeof m === 'string' && m.trim() !== '') {
      return m;
    }
  }
  return 'No se pudieron cargar los envíos.';
}

export function messageForShipmentDetailError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === 401) {
      return 'Sesión expirada o no válida. Volvé a iniciar sesión.';
    }
    if (status === 404) {
      return 'Envío no encontrado.';
    }
    const m = e.response?.data?.message;
    if (typeof m === 'string' && m.trim() !== '') {
      return m;
    }
  }
  return 'No se pudo cargar el envío.';
}
