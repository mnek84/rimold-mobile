import { create } from 'zustand';

/**
 * "Lo que el chofer tiene hoy cambió": un escaneo que le asignó un paquete, o
 * un evento de entrega que el servidor APLICÓ.
 *
 * Las pantallas de la jornada (Entregas y Paradas) tienen estado propio y cada
 * una recargaba sólo al enfocarse. Con el mapa ya abierto, un escaneo hecho
 * desde Entregas o una entrega sincronizada en segundo plano no se veían hasta
 * cambiar de pestaña: el chofer seguía viendo paradas que ya no eran.
 *
 * Es un contador, no datos: cada pantalla vuelve a pedir lo suyo al servidor,
 * que es la única fuente de verdad. No se persiste.
 */
type DriverDayState = {
  seq: number;
  changed: () => void;
};

export const useDriverDayStore = create<DriverDayState>((set) => ({
  seq: 0,
  changed: () => set((s) => ({ seq: s.seq + 1 })),
}));

/** Para llamar fuera de React (cola de sincronización, modales). */
export function notifyDriverDayChanged(): void {
  useDriverDayStore.getState().changed();
}
