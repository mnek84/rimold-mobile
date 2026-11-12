import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect, useState } from 'react';

import { IconButton, ScreenContainer } from '@components/ui';
import { useSyncStatusStore } from '@core/sync';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { useTheme } from '@theme';

import { DeliveryListView } from './components/DeliveryListView';
import { WorkdayFinishSheet } from './components/WorkdayFinishSheet';
import { DeliveryReportFailureScanModal } from './DeliveryReportFailureScanModal';
import { DeliveryScanPackageModal } from './DeliveryScanPackageModal';
import { useDeliveryList } from './hooks/useDeliveryList';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryList'>;

/**
 * Con la pantalla en foco y envíos Flex pendientes, el listado se relee cada
 * minuto: un Flex se confirma en otra app y su estado llega por webhook de
 * Mercado Libre, así que el chofer que vuelve de Flex tiene que verlo cerrado
 * sin tocar nada.
 */
const FLEX_POLL_MS = 60_000;

export function DeliveryListScreen({ navigation }: Props) {
  const theme = useTheme();
  const list = useDeliveryList();
  const [scanOpen, setScanOpen] = useState(false);
  const [reportFailureOpen, setReportFailureOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const permanentSyncFailures = useSyncStatusStore((s) => s.permanentFailureCount);

  useFocusEffect(list.reloadSilent);

  const hasFlexPending = list.counts.flexPending > 0;
  const { reloadSilent } = list;
  useFocusEffect(
    useCallback(() => {
      if (!hasFlexPending) return undefined;
      const t = setInterval(reloadSilent, FLEX_POLL_MS);
      return () => clearInterval(t);
    }, [hasFlexPending, reloadSilent]),
  );

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
        counts={list.counts}
        filter={list.filter}
        onChangeFilter={list.setFilter}
        onRefresh={list.onRefresh}
        onPressScan={() => setScanOpen(true)}
        onPressReportFailure={() => setReportFailureOpen(true)}
        onPressShipment={onPressShipment}
        onPressFinishWorkday={() => setFinishOpen(true)}
        permanentSyncFailures={permanentSyncFailures}
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
      <WorkdayFinishSheet
        visible={finishOpen}
        onClose={() => {
          setFinishOpen(false);
          list.reloadSilent();
        }}
        onFinished={list.reloadSilent}
      />
    </ScreenContainer>
  );
}
