import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';

import { ScreenContainer } from '@components/ui';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';

import { DeliveryListView } from './components/DeliveryListView';
import { DeliveryScanPackageModal } from './DeliveryScanPackageModal';
import { useDeliveryList } from './hooks/useDeliveryList';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryList'>;

export function DeliveryListScreen({ navigation }: Props) {
  const list = useDeliveryList();
  const [scanOpen, setScanOpen] = useState(false);

  useFocusEffect(list.reloadSilent);

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
        onPressFlexMap={
          list.flexBatchId != null
            ? () => navigation.navigate('FlexBatchMap', { batchId: list.flexBatchId! })
            : undefined
        }
        onRefresh={list.onRefresh}
        onPressScan={() => setScanOpen(true)}
        onPressShipment={onPressShipment}
      />
      <DeliveryScanPackageModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onAssigned={list.reloadSilent}
      />
    </ScreenContainer>
  );
}
