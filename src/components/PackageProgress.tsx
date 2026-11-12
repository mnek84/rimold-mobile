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
              <Text
                style={[styles.chipText, done && styles.chipTextDone]}
                maxFontSizeMultiplier={1.3}
              >
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
  const { colors, spacing, typography } = theme;
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: spacing.radiusXl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xxs,
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    title: {
      ...typography.captionStrong,
      flex: 1,
      color: colors.text,
    },
    count: {
      ...typography.bodyStrong,
      fontWeight: '700',
      color: colors.muted,
      fontVariant: ['tabular-nums'],
    },
    countComplete: {
      color: colors.success,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + spacing.xxs,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: spacing.radiusPill,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      backgroundColor: colors.surface,
    },
    chipDone: {
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
    },
    chipPending: {
      borderColor: colors.border,
    },
    chipText: {
      ...typography.micro,
      color: colors.muted,
      fontVariant: ['tabular-nums'],
    },
    chipTextDone: {
      color: colors.success,
    },
    missing: {
      ...typography.caption,
      color: colors.muted,
    },
  });
}
