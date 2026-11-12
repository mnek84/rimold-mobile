import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { fetchShipmentsToday, type TodayShipmentRow } from '@core/api/shipments';
import { useDriverDayStore, useSyncRejectionStore } from '@core/sync';

import { pickNextShipmentId, shipmentDriverPhaseIndex } from '../deliveryStatus';
import { countRows, FILTER_LABEL, rowsForFilter, type WorkdayFilter } from '../workdayView';

export type DeliveryListSection = { title: string; data: TodayShipmentRow[] };

/**
 * El listado de la jornada: TODOS los envíos del chofer (propios y Flex) en una
 * sola vista, filtrada por lo que le falta: Pendientes · Entregados ·
 * Incidencias. El tipo de envío se ve en cada tarjeta, con su acción.
 *
 * Los envíos y su estado de jornada (`workday_state`) vienen del backend con la
 * misma regla que `GET /driver/workday`, así que los números del listado y del
 * resumen de cierre coinciden.
 */
export function useDeliveryList() {
  const [shipments, setShipments] = useState<TodayShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WorkdayFilter>('pending');

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'initial') {
      setLoading(true);
    } else if (mode === 'refresh') {
      setRefreshing(true);
    }
    if (mode !== 'silent') {
      setError(null);
    }
    try {
      const rows = await fetchShipmentsToday();
      setShipments(rows);
    } catch (e) {
      setShipments([]);
      if (mode !== 'silent') {
        setError(messageForShipmentListError(e));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const onRefresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  const reloadSilent = useCallback(() => {
    void load('silent');
  }, [load]);

  // Un evento rechazado por el servidor (Flex) se relee enseguida: el listado
  // no puede seguir mostrando lo que el chofer creyó haber hecho.
  const rejectionSeq = useSyncRejectionStore((s) => s.seq);
  useEffect(() => {
    if (rejectionSeq > 0) {
      void load('silent');
    }
  }, [rejectionSeq, load]);

  // Una entrega sincronizada en segundo plano (o un escaneo) cambia la jornada.
  const dayChangedSeq = useDriverDayStore((s) => s.seq);
  useEffect(() => {
    if (dayChangedSeq > 0) {
      void load('silent');
    }
  }, [dayChangedSeq, load]);

  const counts = useMemo(() => countRows(shipments), [shipments]);

  const nextShipmentId = useMemo(() => pickNextShipmentId(shipments), [shipments]);

  const sections = useMemo<DeliveryListSection[]>(() => {
    const rows = rowsForFilter(shipments, filter);
    if (filter !== 'pending') {
      return rows.length > 0 ? [{ title: FILTER_LABEL[filter], data: rows }] : [];
    }
    // Pendientes: primero lo que ya salió a reparto, después lo que falta salir.
    const onTheWay = rows.filter((r) => shipmentDriverPhaseIndex(r.status) >= 1);
    const notYet = rows.filter((r) => shipmentDriverPhaseIndex(r.status) < 1);
    return [
      { title: 'En camino', data: onTheWay },
      { title: 'Por salir', data: notYet },
    ].filter((sec) => sec.data.length > 0);
  }, [shipments, filter]);

  const showInitialLoader = loading && shipments.length === 0;

  return {
    loading,
    refreshing,
    error,
    sections,
    nextShipmentId,
    counts,
    onRefresh,
    reloadSilent,
    showInitialLoader,
    filter,
    setFilter,
  };
}
