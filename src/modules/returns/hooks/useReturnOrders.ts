import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptReturnOrder,
  arriveAtReturnStop,
  completeReturnOrder,
  completeReturnStop,
  fetchMyReturnOrders,
  fetchReturnOrder,
  rejectReturnOrder,
  skipReturnStop,
  startReturnOrder,
  startScanningReturnStop,
} from '../api/returnOrders';
import type { ReturnOrder } from '../types';

export const returnOrderKeys = {
  all: ['return-orders'] as const,
  list: () => [...returnOrderKeys.all, 'list'] as const,
  detail: (id: string) => [...returnOrderKeys.all, 'detail', id] as const,
};

function newIdempotencyKey(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useMyReturnOrders() {
  return useQuery({
    queryKey: returnOrderKeys.list(),
    queryFn: ({ signal }) => fetchMyReturnOrders(signal),
    staleTime: 15_000,
  });
}

export function useReturnOrder(id: string | undefined) {
  return useQuery({
    queryKey: id ? returnOrderKeys.detail(id) : [...returnOrderKeys.all, 'detail', 'none'],
    queryFn: ({ signal }) =>
      id ? fetchReturnOrder(id, signal) : Promise.reject(new Error('id required')),
    enabled: !!id,
    // Sólo se refresca sola mientras hay recorrido en curso; una orden cerrada
    // no necesita que el teléfono del chofer siga pidiendo.
    refetchInterval: (query) => {
      const data = query.state.data as ReturnOrder | undefined;
      if (!data) return false;
      return data.status === 'in_progress' || data.status === 'returning_to_warehouse'
        ? 30_000
        : false;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orderId: string) {
  void qc.invalidateQueries({ queryKey: returnOrderKeys.detail(orderId) });
  void qc.invalidateQueries({ queryKey: returnOrderKeys.list() });
}

export function useAcceptReturnOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => acceptReturnOrder(orderId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useRejectReturnOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      rejectReturnOrder(orderId, reason, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useStartReturnOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => startReturnOrder(orderId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useCompleteReturnOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => completeReturnOrder(orderId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useArriveAtReturnStop() {
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
    }) => arriveAtReturnStop(orderId, stopId, { lat, lng }, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useStartScanningReturnStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, stopId }: { orderId: string; stopId: string }) =>
      startScanningReturnStop(orderId, stopId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useCompleteReturnStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, stopId }: { orderId: string; stopId: string }) =>
      completeReturnStop(orderId, stopId, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}

export function useSkipReturnStop() {
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
    }) => skipReturnStop(orderId, stopId, reason, newIdempotencyKey()),
    onSuccess: (order) => invalidate(qc, order.id),
  });
}
