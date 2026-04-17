import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { borderSubtle, useTheme, type AppTheme } from '@theme';

const ROW_COUNT = 5;

export function DeliveryListSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.root} accessibilityLabel="Cargando envíos">
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rowTop}>
            <View style={styles.lineTitle} />
            <View style={styles.pill} />
          </View>
          <View style={styles.phaseBar}>
            {Array.from({ length: 4 }, (_, j) => (
              <View key={j} style={styles.phaseSeg} />
            ))}
          </View>
          <View style={styles.lineAddress} />
          <View style={[styles.lineAddress, styles.lineAddressShort]} />
        </View>
      ))}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing } = t;
  const lineBg = `${colors.muted}35`;
  return StyleSheet.create({
    root: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
    },
    row: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: borderSubtle,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    lineTitle: {
      flex: 1,
      height: 18,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
    },
    pill: {
      width: 72,
      height: 22,
      borderRadius: spacing.radiusMd,
      backgroundColor: lineBg,
    },
    phaseBar: {
      flexDirection: 'row',
      gap: 5,
      marginBottom: spacing.md,
    },
    phaseSeg: {
      flex: 1,
      height: 5,
      borderRadius: 3,
      backgroundColor: lineBg,
    },
    lineAddress: {
      height: 14,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
      marginBottom: spacing.sm,
    },
    lineAddressShort: {
      width: '70%',
      marginBottom: 0,
    },
  });
}
