import type { StatusBadgeProps } from '@components/ui';
import type { Tone } from '@theme';

import type { PickupOrderStatus, PickupStopStatus } from '../types';

/**
 * Presentación de los estados (tono + icono) para `StatusBadge`. Sólo visual:
 * el texto sigue saliendo de `pickupOrderStatus.ts`, así el color nunca es la
 * única señal. Ver la tabla "Status → tone" de `src/theme/DESIGN_SYSTEM.md`.
 */
export type StatusPresentation = { tone: Tone; icon: NonNullable<StatusBadgeProps['icon']> };

export const PICKUP_ORDER_STATUS_PRESENTATION: Record<PickupOrderStatus, StatusPresentation> = {
  pending: { tone: 'neutral', icon: 'time-outline' },
  accepted: { tone: 'primary', icon: 'calendar-outline' },
  rejected: { tone: 'danger', icon: 'close-circle' },
  in_progress: { tone: 'primary', icon: 'navigate-outline' },
  returning_to_warehouse: { tone: 'primary', icon: 'return-down-back-outline' },
  completed: { tone: 'success', icon: 'checkmark-circle' },
  cancelled: { tone: 'danger', icon: 'close-circle' },
};

export const PICKUP_STOP_STATUS_PRESENTATION: Record<PickupStopStatus, StatusPresentation> = {
  pending: { tone: 'neutral', icon: 'time-outline' },
  en_route: { tone: 'primary', icon: 'navigate-outline' },
  arrived: { tone: 'primary', icon: 'location-outline' },
  scanning: { tone: 'primary', icon: 'scan-outline' },
  completed: { tone: 'success', icon: 'checkmark-circle' },
  skipped: { tone: 'warning', icon: 'play-skip-forward-outline' },
};
