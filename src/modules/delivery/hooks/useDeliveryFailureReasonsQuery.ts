import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@core/api/client';

export type DeliveryFailureReasonDto = {
  id: string;
  code: string;
  label: string;
  sort_order: number;
};

async function fetchDeliveryFailureReasons(): Promise<DeliveryFailureReasonDto[]> {
  const { data } = await apiClient.get<{ data: DeliveryFailureReasonDto[] }>(
    '/delivery-failure-reasons',
  );
  return Array.isArray(data.data) ? data.data : [];
}

export function useDeliveryFailureReasonsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['delivery-failure-reasons'],
    queryFn: fetchDeliveryFailureReasons,
    enabled,
    staleTime: 5 * 60_000,
  });
}
