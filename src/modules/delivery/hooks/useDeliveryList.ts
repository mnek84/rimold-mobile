import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { fetchShipmentsToday, type TodayShipmentRow } from '@core/api/shipments';
import { useDeliveryStore } from '@store/useDeliveryStore';

import { groupShipmentsForSections, pickNextShipmentId } from '../deliveryStatus';

export type DeliveryListSection = { title: string; data: TodayShipmentRow[] };

export function useDeliveryList() {
  const [shipments, setShipments] = useState<TodayShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setDeliveryData = useDeliveryStore((s) => s.setDeliveryData);

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
      const routeId =
        rows.find((r) => typeof r.route_id === 'string' && r.route_id !== '' && r.execution_type !== 'flex')
          ?.route_id ?? null;
      setDeliveryData(rows.length, routeId);
    } catch (e) {
      setShipments([]);
      if (mode !== 'silent') {
        setError(messageForShipmentListError(e));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setDeliveryData]);

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

  const internalRouteId = useMemo(() => {
    for (const r of shipments) {
      if (typeof r.route_id === 'string' && r.route_id !== '' && r.execution_type !== 'flex') {
        return r.route_id;
      }
    }
    return null;
  }, [shipments]);

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

  const showInitialLoader = loading && shipments.length === 0;

  return {
    loading,
    refreshing,
    error,
    sections,
    nextShipmentId,
    flexBatchId,
    onRefresh,
    reloadSilent,
    showInitialLoader,
  };
}
