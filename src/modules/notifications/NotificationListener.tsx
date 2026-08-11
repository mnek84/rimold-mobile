import type { JSX } from 'react';

import { UrgentAlertModal } from './components/UrgentAlertModal';
import { useNotificationListener } from './hooks/useNotificationListener';

/**
 * Instala los listeners de push (Expo + Reverb) mientras esté montado y
 * renderiza el modal urgente global. Debe montarse una sola vez, dentro del
 * árbol autenticado.
 */
export function NotificationListener(): JSX.Element {
  useNotificationListener();
  return <UrgentAlertModal />;
}
