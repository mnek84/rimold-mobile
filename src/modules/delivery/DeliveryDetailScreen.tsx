import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@components/ui';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { borderSubtle, useTheme } from '@theme';

import { DeliveryShipmentActions } from './components/DeliveryShipmentActions';
import { DeliveryShipmentDetailHeader } from './components/DeliveryShipmentDetailHeader';
import { DeliveryShipmentDetailSkeleton } from './components/DeliveryShipmentDetailSkeleton';
import { DeliveryShipmentTimeline } from './components/DeliveryShipmentTimeline';
import { DeliveryDeliveredModal } from './DeliveryDeliveredModal';
import { DeliveryFailedModal } from './DeliveryFailedModal';
import { useDeliveryShipmentDetail } from './hooks/useDeliveryShipmentDetail';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryDetail'>;

/**
 * Shell: route params, header title, modals. Shipment logic in {@link useDeliveryShipmentDetail}; UI in components.
 */
export function DeliveryDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const detail = useDeliveryShipmentDetail(route.params.shipmentId);
  const shell = useMemo(() => createShellStyles(theme), [theme]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: detail.headerTitle });
  }, [navigation, detail.headerTitle]);

  return (
    <>
      <ScreenContainer scroll contentContainerStyle={shell.content}>
        {detail.loading ? <DeliveryShipmentDetailSkeleton /> : null}

        {detail.error != null && detail.error !== '' ? (
          <Text style={shell.errorBanner}>{detail.error}</Text>
        ) : null}

        {!detail.loading && detail.error == null && detail.shipment != null ? (
          <>
            <DeliveryShipmentDetailHeader
              trackingLabel={detail.trackingLabel}
              addressText={detail.addressText}
              statusCode={detail.effectiveStatusCode}
            />
            <View style={shell.headerDivider} />
            <DeliveryShipmentTimeline steps={detail.timelineSteps} />
            <View style={shell.actionsSection}>
              <DeliveryShipmentActions
                effectiveStatusCode={detail.effectiveStatusCode}
                onAction={detail.handleStatusAction}
              />
            </View>
          </>
        ) : null}
      </ScreenContainer>

      <DeliveryDeliveredModal
        visible={detail.deliveredModal.visible}
        shipmentId={detail.shipmentId}
        onClose={detail.deliveredModal.close}
        onQueued={detail.deliveredModal.onQueued}
      />
      <DeliveryFailedModal
        visible={detail.failedModal.visible}
        shipmentId={detail.shipmentId}
        onClose={detail.failedModal.close}
        onQueued={detail.failedModal.onQueued}
      />
    </>
  );
}

function createShellStyles(t: ReturnType<typeof useTheme>) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    content: {
      paddingBottom: spacing.xxl + spacing.lg,
    },
    headerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: borderSubtle,
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    actionsSection: {
      marginTop: spacing.xl,
      paddingTop: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: borderSubtle,
    },
    errorBanner: {
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.danger,
      color: colors.danger,
      ...typography.body,
      marginBottom: spacing.md,
    },
  });
}
