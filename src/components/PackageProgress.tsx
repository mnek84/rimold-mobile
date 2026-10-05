import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

export type PackageProgressProps = {
  /** Cantidad total de bultos del envío. */
  total: number;
  /** Posiciones (1-based) ya escaneadas en este punto del flujo. */
  scannedIndexes: number[];
  /** Tracking del envío, para encabezar el bloque. */
  trackingId?: string | null;
  /** Códigos de bulto faltantes, cuando el backend los informa. */
  missingCodes?: string[];
};

/**
 * Progreso por bulto de un envío: "✓ Bulto 1/4 … ○ Bulto 4/4".
 *
 * Hasta ahora las pantallas de escaneo sólo mostraban acumuladores de envíos,
 * así que un envío de 4 bultos se veía igual con 1 escaneado que con 4. Este
 * bloque es lo que le dice al operador cuál bulto le falta.
 */
export function PackageProgress({
  total,
  scannedIndexes,
  trackingId,
  missingCodes,
}: PackageProgressProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const safeTotal = Math.max(1, total);
  const scanned = new Set(scannedIndexes);
  const complete = scanned.size >= safeTotal;

  // Un solo bulto no necesita desglose: el contador general ya lo dice.
  if (safeTotal <= 1) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {trackingId != null && trackingId !== '' ? `Envío ${trackingId}` : 'Envío'} — {safeTotal}{' '}
          bultos
        </Text>
        <Text style={[styles.count, complete && styles.countComplete]}>
          {scanned.size}/{safeTotal}
        </Text>
      </View>

      <View style={styles.chips}>
        {Array.from({ length: safeTotal }, (_, i) => i + 1).map((index) => {
          const done = scanned.has(index);
          return (
            <View key={index} style={[styles.chip, done ? styles.chipDone : styles.chipPending]}>
              <Ionicons
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={done ? theme.colors.success : theme.colors.muted}
              />
              <Text style={[styles.chipText, done && styles.chipTextDone]}>
                {index}/{safeTotal}
              </Text>
            </View>
          );
        })}
      </View>

      {!complete && missingCodes != null && missingCodes.length > 0 ? (
        <Text style={styles.missing} numberOfLines={2}>
          Falta: {missingCodes.join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    count: {
      color: theme.colors.muted,
      fontSize: 15,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    countComplete: {
      color: theme.colors.success,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    chipDone: {
      borderColor: theme.colors.success,
    },
    chipPending: {
      borderColor: theme.colors.border,
    },
    chipText: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    chipTextDone: {
      color: theme.colors.success,
    },
    missing: {
      color: theme.colors.muted,
      fontSize: 12,
    },
  });
}
