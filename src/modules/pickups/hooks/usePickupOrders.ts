import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptPickupOrder,
  arriveAtStop,
  completePickupOrder,
  completeStop,
  fetchMyPickupOrders,
  fetchPickupOrder,
  rejectPickupOrder,
  reportPickupIncident,
  skipStop,
  startPickupOrder,
  startScanningStop,
} from '../api/pickupOrders';
import type { IncidentKind, IncidentPhase } from '../types';
import { cancelReminderForOrder } from '../lib/reminderScheduler';
import type { PickupOrder } from '../types';

export const pickupOrderKeys = {
  all: ['pickup-orders'] as const,
  list: () => [...pickupOrderKeys.all, 'list'] as const,
  detail: (id: string) => [...pickupOrderKeys.all, 'detail', id] as const,
};

function newIdempotencyKey(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useMyPickupOrders() {
  return useQuery({
    queryKey: pickupOrderKeys.list(),
    queryFn: ({ signal }) => fetchMyPickupOrders(signal),
    staleTime: 15_000,
  });
}

export function usePickupOrder(id: string | undefined) {
  return useQuery({
    queryKey: id ? pickupOrderKeys.detail(id) : [...pickupOrderKeys.all, 'detail', 'none'],
    queryFn: ({ signal }) => (id ? fetchPickupOrder(id, signal) : Promise.reject(new Error('id required'))),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as PickupOrder | undefined;
      if (!data) return false;
      if (data.status === 'in_progress' || data.status === 'returning_to_warehouse') {
        return 30_000;
      }
      return false;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orderId: string) {
  void qc.invalidateQueries({ queryKey: pickupOrderKeys.detail(orderId) });
  void qc.invalidateQueries({ queryKey: pickupOrderKeys.list() });
}

export function useAcceptPickupOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => acceptPickupOrder(orderId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useRejectPickupOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      rejectPickupOrder(orderId, reason, newIdempotencyKey()),
    onSuccess: async (order) => {
      await cancelReminderForOrder(order.id);
      invalidate(qc, order.id);
    },
  });
}

export function useStartPickupOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => startPickupOrder(orderId, newIdempotencyKey()),
    onSuccess: async (order) => {
      await cancelReminderForOrder(order.id);
      invalidate(qc, order.id);
    },
  });
}

export function useCompletePickupOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      lat,
      lng,
    }: {
      orderId: string;
      lat?: number | null;
      lng?: number | null;
    }) => completePickupOrder(orderId, { lat, lng }, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useArriveAtStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      stopId,
      lat,
      lng,
    }: {
      orderId: string;
      stopId: string;
      lat?: number | null;
      lng?: number | null;
    }) => arriveAtStop(orderId, stopId, { lat, lng }, newIdempotencyKey()),
    onSuccess: (_stop, vars) => invalidate(qc, vars.orderId),
  });
}

export function useStartScanningStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, stopId }: { orderId: string; stopId: string }) =>
      startScanningStop(orderId, stopId, newIdempotencyKey()),
    onSuccess: (_stop, vars) => invalidate(qc, vars.orderId),
  });
}

export function useCompleteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, stopId }: { orderId: string; stopId: string }) =>
      completeStop(orderId, stopId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useSkipStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      stopId,
      reason,
    }: {
      orderId: string;
      stopId: string;
      reason: string;
    }) => skipStop(orderId, stopId, reason, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useReportPickupIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      phase,
      kind,
      description,
      pickupStopId,
    }: {
      orderId: string;
      phase: IncidentPhase;
      kind: IncidentKind;
      description: string;
      pickupStopId?: string | null;
    }) =>
      reportPickupIncident(
        orderId,
        { phase, kind, description, pickupStopId },
        newIdempotencyKey(),
      ),
    onSuccess: (_incident, vars) => invalidate(qc, vars.orderId),
  });
}
