import { apiClient } from './client';

export type CageSessionStatus = 'active' | 'closed';

export type CageSession = {
  id: string;
  status: CageSessionStatus;
  name: string;
  started_at: string | null;
  started_by_user_id: string | null;
  closed_at: string | null;
  closed_by_user_id: string | null;
};

export type CageSessionCage = {
  id: string;
  name: string;
  zone: { id: string; name: string; business_id: string | null } | null;
  shipments_count: number;
};

export type CageSessionView = {
  session: CageSession | null;
  cages: CageSessionCage[];
};

export type CageAssignment = {
  cage_id: string;
  driver_id: string | null;
};

function ensureView(payload: unknown): CageSessionView {
  if (payload === null || typeof payload !== 'object') return { session: null, cages: [] };
  const o = payload as { session?: CageSession | null; cages?: CageSessionCage[] };
  return {
    session: o.session ?? null,
    cages: Array.isArray(o.cages) ? o.cages : [],
  };
}

export async function fetchActiveCageSession(): Promise<CageSessionView> {
  const { data } = await apiClient.get<unknown>('/cage-sessions/active');
  return ensureView(data);
}

export async function startCageSession(): Promise<CageSessionView> {
  const { data } = await apiClient.post<unknown>('/cage-sessions');
  return ensureView(data);
}

export async function moveCageSessionShipment(
  sessionId: string,
  params: { shipmentId: string; toCageId: string },
): Promise<void> {
  await apiClient.post(`/cage-sessions/${sessionId}/move`, {
    shipment_id: params.shipmentId,
    to_cage_id: params.toCageId,
  });
}

export async function closeCageSession(
  sessionId: string,
  assignments: CageAssignment[],
): Promise<CageSessionView> {
  const { data } = await apiClient.post<unknown>(`/cage-sessions/${sessionId}/close`, {
    assignments: assignments.map((a) => ({
      cage_id: a.cage_id,
      driver_id: a.driver_id ?? null,
    })),
  });
  return ensureView(data);
}
