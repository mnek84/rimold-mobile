import { useCallback, useEffect, useMemo, useState } from 'react';

import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { fetchShipmentsToday, type TodayShipmentRow } from '@core/api/shipments';

import {
  groupShipmentsForSections,
  matchesShipmentSearch,
  pickNextShipmentId,
} from '../deliveryStatus';

export type DeliveryListSection = { title: string; data: TodayShipmentRow[] };

export function useDeliveryList() {
  const [shipments, setShipments] = useState<TodayShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredShipments = useMemo(() => {
    if (searchQuery.trim() === '') {
      return shipments;
    }
    return shipments.filter((r) => matchesShipmentSearch(r, searchQuery));
  }, [shipments, searchQuery]);

  const sections = useMemo<DeliveryListSection[]>(
    () => groupShipmentsForSections(filteredShipments),
    [filteredShipments],
  );

  const showInitialLoader = loading && shipments.length === 0;

  return {
    loading,
    refreshing,
    error,
    searchQuery,
    setSearchQuery,
    sections,
    nextShipmentId,
    onRefresh,
    reloadSilent,
    showInitialLoader,
  };
}
