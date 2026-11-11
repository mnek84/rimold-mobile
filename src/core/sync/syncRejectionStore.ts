import { create } from 'zustand';

/**
 * Eventos que el servidor ACEPTÓ (200, salen de la cola) pero decidió NO
 * aplicar al envío. Hoy: acciones de entrega sobre un envío Flex, cuyo estado
 * lo informa Mercado Libre (`projection: rejected_external_authority`), o un
 * chofer que no es el asignado (`rejected_not_owner`).
 *
 * Existe para que ninguna pantalla siga mostrando un estado optimista que el
 * servidor rechazó: el detalle se suscribe, descarta su optimista y recarga;
 * el listado y el mapa recargan. Ver `handleEvent.ts`.
 *
 * No se persiste: un rechazo sólo importa mientras la app está abierta; al
 * reabrir, todo se lee del servidor y no hay optimista que corregir.
 */
export type SyncRejection = {
  eventId: string;
  shipmentId: string;
  /** `rejected_external_authority` | `rejected_not_owner` | otro motivo futuro. */
  reason: string;
  /** Estado real del envío según el servidor, si lo informó. */
  statusCode: string | null;
  at: number;
};

type SyncRejectionState = {
  /** Último rechazo (los suscriptores reaccionan al cambio). */
  last: SyncRejection | null;
  /** Contador monotónico: dos rechazos idénticos seguidos igual disparan. */
  seq: number;
  report: (r: Omit<SyncRejection, 'at'>) => void;
};

export const useSyncRejectionStore = create<SyncRejectionState>((set) => ({
  last: null,
  seq: 0,
  report: (r) => set((s) => ({ last: { ...r, at: Date.now() }, seq: s.seq + 1 })),
}));

export function rejectionMessage(reason: string): string {
  if (reason === 'rejected_external_authority') {
    return 'Este envío Flex se gestiona en la app de Mercado Libre. El cambio no se aplicó.';
  }
  if (reason === 'rejected_not_owner') {
    return 'Este envío ya no está asignado a vos. El cambio no se aplicó.';
  }
  return 'El servidor no aplicó el cambio.';
}
