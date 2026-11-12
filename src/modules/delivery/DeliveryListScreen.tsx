import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect, useState } from 'react';

import { IconButton, ScreenContainer } from '@components/ui';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { useTheme } from '@theme';

import { DeliveryListView } from './components/DeliveryListView';
import { DeliveryReportFailureScanModal } from './DeliveryReportFailureScanModal';
import { DeliveryScanPackageModal } from './DeliveryScanPackageModal';
import { useDeliveryList } from './hooks/useDeliveryList';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryList'>;

export function DeliveryListScreen({ navigation }: Props) {
  const theme = useTheme();
  const list = useDeliveryList();
  const [scanOpen, setScanOpen] = useState(false);
  const [reportFailureOpen, setReportFailureOpen] = useState(false);

  useFocusEffect(list.reloadSilent);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="time-outline"
          accessibilityLabel="Ver historial de entregas"
          onPress={() => navigation.navigate('DeliveryHistory')}
          color={theme.colors.primary}
        />
      ),
    });
  }, [navigation, theme.colors.primary]);

  const onPressShipment = useCallback(
    (shipmentId: string) => navigation.navigate('DeliveryDetail', { shipmentId }),
    [navigation],
  );

  return (
    <ScreenContainer>
      <DeliveryListView
        sections={list.sections}
        loading={list.loading}
        showInitialLoader={list.showInitialLoader}
        refreshing={list.refreshing}
        error={list.error}
        nextShipmentId={list.nextShipmentId}
        flexBatchId={list.flexBatchId}
        pendingCount={list.pendingCount}
        failedCount={list.failedCount}
        deliveredTodayCount={list.deliveredTodayCount}
        channelFilter={list.channelFilter}
        onChangeChannelFilter={list.setChannelFilter}
        channelCounts={list.channelCounts}
        onPressFlexMap={
          list.flexBatchId != null
            ? () => navigation.navigate('FlexBatchMap', { batchId: list.flexBatchId! })
            : undefined
        }
        onRefresh={list.onRefresh}
        onPressScan={() => setScanOpen(true)}
        onPressReportFailure={() => setReportFailureOpen(true)}
        onPressShipment={onPressShipment}
      />
      <DeliveryScanPackageModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onAssigned={list.reloadSilent}
      />
      <DeliveryReportFailureScanModal
        visible={reportFailureOpen}
        onClose={() => setReportFailureOpen(false)}
        onReported={list.reloadSilent}
      />
    </ScreenContainer>
  );
}
