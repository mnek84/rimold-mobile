import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { fetchShipmentsToday, type TodayShipmentRow } from '@core/api/shipments';

import { groupShipmentsForSections, pickNextShipmentId, statusDeliveryGroup } from '../deliveryStatus';

export type DeliveryListSection = { title: string; data: TodayShipmentRow[] };

export function useDeliveryList() {
  const [shipments, setShipments] = useState<TodayShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    () => groupShipmentsForSections(shipments),
    [shipments],
  );

  const pendingCount = useMemo(
    () => sections.reduce((acc, s) => acc + s.data.length, 0),
    [sections],
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
    deliveredTodayCount,
    onRefresh,
    reloadSilent,
    showInitialLoader,
  };
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
