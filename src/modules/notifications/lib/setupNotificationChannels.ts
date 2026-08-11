import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Canales Android para diferenciar prioridad y sonido de los distintos tipos
 * de mensajes admin. En iOS los canales no aplican; la prioridad y sonido se
 * setean por mensaje.
 *
 * Idempotente: crear un canal existente sólo lo actualiza. Se llama en el
 * primer registro de push tokens.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('warnings', {
    name: 'Advertencias',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#f59e0b',
  });

  await Notifications.setNotificationChannelAsync('urgent-alerts', {
    name: 'Alertas urgentes',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#dc2626',
    bypassDnd: true,
  });
}
