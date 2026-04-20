import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@components/ui';
import {
  formatDriverShipmentStatusLabel,
  shipmentListBadgeColors,
  shipmentListBadgeKind,
} from '../deliveryStatus';
import { useTheme, type AppTheme } from '@theme';

type Props = {
  trackingLabel: string;
  addressText: string;
  statusCode: string | null;
  deliveryVisitCount: number;
};

function showStatusBadge(statusLabel: string): boolean {
  const t = statusLabel.trim();
  return t !== '' && t !== '—';
}

export function DeliveryShipmentDetailHeader({
  trackingLabel,
  addressText,
  statusCode,
  deliveryVisitCount,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const statusLabel = formatDriverShipmentStatusLabel(statusCode ?? '');
  const badgeVisible = showStatusBadge(statusLabel);
  const badgeKind = shipmentListBadgeKind(statusCode ?? '');
  const badgeColors = shipmentListBadgeColors(theme, badgeKind);

  return (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.tracking} selectable numberOfLines={3}>
          {trackingLabel}
        </Text>
        {badgeVisible ? (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: badgeColors.bg, borderColor: badgeColors.border },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: badgeColors.text }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.address} numberOfLines={4}>
        {addressText.trim() !== '' ? addressText : 'Sin dirección'}
      </Text>
      {deliveryVisitCount > 0 ? (
        <Text style={styles.visitLine} numberOfLines={1}>
          Visita de reparto: {deliveryVisitCount}
        </Text>
      ) : null}
    </Card>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    card: {
      marginBottom: 0,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    tracking: {
      flex: 1,
      minWidth: 0,
      ...typography.title,
      color: colors.text,
      letterSpacing: -0.25,
    },
    address: {
      ...typography.body,
      color: colors.muted,
    },
    visitLine: {
      ...typography.captionStrong,
      color: colors.text,
      marginTop: spacing.sm,
      opacity: 0.9,
    },
    statusBadge: {
      flexShrink: 0,
      maxWidth: '38%',
      marginTop: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: spacing.radiusMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statusBadgeText: {
      ...typography.captionStrong,
      textAlign: 'center',
    },
  });
}
