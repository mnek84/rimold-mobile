import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { fetchShipmentsToday, type TodayShipmentRow } from '@core/api/shipments';
import { useSyncRejectionStore } from '@core/sync';

import {
  groupShipmentsForSections,
  pickNextShipmentId,
  statusDeliveryGroup,
  type DeliveryGroup,
} from '../deliveryStatus';

export type DeliveryListSection = { title: string; data: TodayShipmentRow[] };

/**
 * Filtro por modalidad. `own` = lo opera nuestra app (propios + Tiendanube);
 * `flex` = lo entrega la app de Mercado Libre. Es un filtro de VISTA: los
 * contadores de arriba siempre muestran el total, para que filtrar nunca haga
 * parecer más chica la jornada.
 */
export type ChannelFilter = 'all' | 'own' | 'flex';

export function useDeliveryList() {
  const [shipments, setShipments] = useState<TodayShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');

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

  const channelCounts = useMemo(() => {
    let flex = 0;
    for (const r of shipments) {
      if (r.channel.operator === 'mercadolibre_flex') flex++;
    }
    return { all: shipments.length, flex, own: shipments.length - flex };
  }, [shipments]);

  const visibleShipments = useMemo(() => {
    if (channelFilter === 'all') return shipments;
    const wantFlex = channelFilter === 'flex';
    return shipments.filter((r) => (r.channel.operator === 'mercadolibre_flex') === wantFlex);
  }, [shipments, channelFilter]);

  const nextShipmentId = useMemo(() => pickNextShipmentId(shipments), [shipments]);

  const flexBatchId = useMemo(() => {
    for (const r of shipments) {
      if (typeof r.flex_batch_id === 'string' && r.flex_batch_id !== '') {
        return r.flex_batch_id;
      }
    }
    return null;
  }, [shipments]);

  const sections = useMemo<DeliveryListSection[]>(
    () => groupShipmentsForSections(visibleShipments),
    [visibleShipments],
  );

  const pendingCount = useMemo(
    () => shipments.filter((r) => isPendingDeliveryGroup(statusDeliveryGroup(r.status))).length,
    [shipments],
  );

  const failedCount = useMemo(
    () => shipments.filter((r) => statusDeliveryGroup(r.status) === 'fallidos').length,
    [shipments],
  );

  const deliveredTodayCount = useMemo(
    () => countDeliveredToday(shipments),
    [shipments],
  );

  const showInitialLoader = loading && shipments.length === 0;

  return {
    loading,
    refreshing,
    error,
    sections,
    nextShipmentId,
    flexBatchId,
    pendingCount,
    failedCount,
    deliveredTodayCount,
    onRefresh,
    reloadSilent,
    showInitialLoader,
    channelFilter,
    setChannelFilter,
    channelCounts,
  };
}

/** Still owed on this pass: everything that is neither closed nor failed. */
function isPendingDeliveryGroup(group: DeliveryGroup): boolean {
  return group === 'pendientes' || group === 'en_ruta';
}

/** Counts shipments delivered/returned today (local timezone), based on `delivered_at`. */
function countDeliveredToday(rows: TodayShipmentRow[]): number {
  const today = localDateKey(new Date());
  let count = 0;
  for (const row of rows) {
    if (statusDeliveryGroup(row.status) !== 'entregados') {
      continue;
    }
    if (row.status !== 'delivered' && row.status !== 'returned') {
      continue;
    }
    if (row.delivered_at === null || row.delivered_at === '') {
      continue;
    }
    const parsed = new Date(row.delivered_at);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    if (localDateKey(parsed) === today) {
      count++;
    }
  }
  return count;
}

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
