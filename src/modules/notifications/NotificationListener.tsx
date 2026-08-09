import { useNotificationListener } from './hooks/useNotificationListener';

/**
 * Componente sin UI que instala los listeners de push mientras esté montado.
 * Debe renderizarse una sola vez, dentro del árbol autenticado.
 */
export function NotificationListener(): null {
  useNotificationListener();
  return null;
}
