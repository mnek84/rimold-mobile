import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

export function DeliveryShipmentDetailSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.root} accessibilityLabel="Cargando detalle del envío">
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={styles.trackingLine} />
          <View style={styles.badge} />
        </View>
        <View style={styles.addrLine} />
        <View style={[styles.addrLine, styles.addrLineShort]} />
      </View>
      <View style={styles.timelineCard}>
        <View style={styles.timelineTitle} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.timelineRow}>
            <View style={styles.dot} />
            <View style={styles.stepLine} />
          </View>
        ))}
      </View>
      <View style={styles.actionsBlock}>
        <View style={styles.actionsTitle} />
        <View style={styles.actionBtn} />
        <View style={styles.actionBtn} />
      </View>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing } = t;
  const lineBg = `${colors.muted}38`;
  return StyleSheet.create({
    root: {
      gap: spacing.lg,
    },
    headerCard: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    trackingLine: {
      flex: 1,
      height: 26,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
    },
    badge: {
      width: 64,
      height: 22,
      borderRadius: spacing.radiusMd,
      backgroundColor: lineBg,
    },
    addrLine: {
      height: 16,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
      marginBottom: spacing.sm,
    },
    addrLineShort: {
      width: '75%',
      marginBottom: 0,
    },
    timelineCard: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    timelineTitle: {
      width: '55%',
      height: 14,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
      marginBottom: spacing.lg,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: lineBg,
      marginRight: spacing.md,
    },
    stepLine: {
      flex: 1,
      height: 16,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
    },
    actionsBlock: {
      gap: spacing.md,
      paddingTop: spacing.sm,
    },
    actionsTitle: {
      width: '40%',
      height: 22,
      borderRadius: spacing.radiusSm,
      backgroundColor: lineBg,
    },
    actionBtn: {
      height: 56,
      borderRadius: spacing.radiusCard,
      backgroundColor: lineBg,
    },
  });
}
