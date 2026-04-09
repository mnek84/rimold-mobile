import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';

import { ScreenContainer } from '@components/ui';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';

import { DeliveryListView } from './components/DeliveryListView';
import { useDeliveryList } from './hooks/useDeliveryList';
import { DeliveryScanPackageModal } from './DeliveryScanPackageModal';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryList'>;

/**
 * Shell: navigation + scan modal. List data and UI live in {@link useDeliveryList} / {@link DeliveryListView}.
 */
export function DeliveryListScreen({ navigation }: Props) {
  const list = useDeliveryList();
  const [scanOpen, setScanOpen] = useState(false);
  const internalRouteId = list.internalRouteId;
  const flexBatchId = list.flexBatchId;

  const onPressShipment = useCallback(
    (shipmentId: string) => {
      navigation.navigate('DeliveryDetail', { shipmentId });
    },
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
        searchQuery={list.searchQuery}
        onSearchQueryChange={list.setSearchQuery}
        nextShipmentId={list.nextShipmentId}
        internalRouteId={internalRouteId}
        flexBatchId={flexBatchId}
        onPressInternalRoute={
          internalRouteId != null ? () => navigation.navigate('InternalRoute', { routeId: internalRouteId }) : undefined
        }
        onPressFlexMap={
          flexBatchId != null ? () => navigation.navigate('FlexBatchMap', { batchId: flexBatchId }) : undefined
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
