import { useEffect, type JSX } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { useAdminMessagesStore } from '../state/adminMessagesStore';

const URGENT_VIBRATION_PATTERN = [0, 500, 250, 500, 250, 500];

/**
 * Modal bloqueante que se muestra cuando el driver recibe un mensaje urgente
 * (por push o por Reverb). No se cierra con back button ni tap fuera —
 * fuerza al chofer a leer y confirmar con "Entendido".
 */
export function UrgentAlertModal(): JSX.Element {
  const current = useAdminMessagesStore((s) => s.currentUrgent);
  const dismiss = useAdminMessagesStore((s) => s.dismissUrgent);

  useEffect(() => {
    if (current == null) return;
    try {
      Vibration.vibrate(URGENT_VIBRATION_PATTERN);
    } catch {
      /* Web / device sin vibrador: ignorar. */
    }
    return () => {
      try {
        Vibration.cancel();
      } catch {
        /* noop */
      }
    };
  }, [current]);

  return (
    <Modal
      visible={current != null}
      transparent
      animationType="fade"
      onRequestClose={() => {
        /* Bloqueado: no cerrar con back. Requiere tap explícito en "Entendido". */
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.tag}>URGENTE</Text>
          {current ? (
            <>
              <Text style={styles.title}>{current.title}</Text>
              <Text style={styles.body}>{current.body}</Text>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={dismiss}
          >
            <Text style={styles.buttonText}>Entendido</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#dc2626',
  },
  tag: {
    color: '#dc2626',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 21,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: '#b91c1c',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
