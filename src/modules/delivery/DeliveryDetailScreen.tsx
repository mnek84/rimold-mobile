import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, ScreenContainer } from '@components/ui';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { useTheme } from '@theme';

import { DeliveryShipmentActions } from './components/DeliveryShipmentActions';
import { DeliveryShipmentDetailHeader } from './components/DeliveryShipmentDetailHeader';
import { DeliveryShipmentDetailSkeleton } from './components/DeliveryShipmentDetailSkeleton';
import { DeliveryShipmentTimeline } from './components/DeliveryShipmentTimeline';
import { ChannelBadge } from './components/ChannelBadge';
import { FlexHandoffCard } from './components/FlexHandoffCard';
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
          <Banner tone="danger" message={detail.error} style={shell.errorBanner} />
        ) : null}

        {!detail.loading && detail.error == null && detail.shipment != null ? (
          <>
            <DeliveryShipmentDetailHeader
              trackingLabel={detail.trackingLabel}
              addressText={detail.addressText}
              statusCode={detail.effectiveStatusCode}
              deliveryVisitCount={detail.deliveryVisitCount}
              addressTypeCode={detail.addressTypeCode}
            />
            <View style={shell.headerDivider} />
            {detail.channel !== null ? (
              <View style={shell.flexHandoff}>
                <ChannelBadge channel={detail.channel} />
              </View>
            ) : null}
            {detail.isFlex ? (
              <View style={shell.flexHandoff}>
                <FlexHandoffCard statusCode={detail.effectiveStatusCode} externalStatus={detail.externalStatus} />
              </View>
            ) : null}
            <DeliveryShipmentTimeline steps={detail.timelineSteps} />
            <View style={shell.actionsSection}>
              <DeliveryShipmentActions
                effectiveStatusCode={detail.effectiveStatusCode}
                onAction={detail.handleStatusAction}
                driverActionsAllowed={detail.driverActionsAllowed}
              />
            </View>
          </>
        ) : null}
      </ScreenContainer>

      <DeliveryDeliveredModal
        visible={detail.deliveredModal.visible}
        shipmentId={detail.shipmentId}
        isFlex={detail.isFlex}
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
  const { colors, spacing } = t;
  return StyleSheet.create({
    content: {
      paddingBottom: spacing.xxl + spacing.lg,
    },
    flexHandoff: {
      marginBottom: spacing.xl,
    },
    headerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    actionsSection: {
      marginTop: spacing.xl,
      paddingTop: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    errorBanner: {
      marginBottom: spacing.md,
    },
  });
}
