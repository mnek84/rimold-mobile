import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ScreenContainer } from '@components/ui';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { DeliveryListView } from './components/DeliveryListView';
import { DeliveryReportFailureScanModal } from './DeliveryReportFailureScanModal';
import { DeliveryScanPackageModal } from './DeliveryScanPackageModal';
import { useDeliveryList } from './hooks/useDeliveryList';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryList'>;

export function DeliveryListScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const list = useDeliveryList();
  const [scanOpen, setScanOpen] = useState(false);
  const [reportFailureOpen, setReportFailureOpen] = useState(false);

  useFocusEffect(list.reloadSilent);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver historial de entregas"
          onPress={() => navigation.navigate('DeliveryHistory')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerRightButton,
            pressed && styles.headerRightButtonPressed,
          ]}
        >
          <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
        </Pressable>
      ),
    });
  }, [
    navigation,
    styles.headerRightButton,
    styles.headerRightButtonPressed,
    theme.colors.primary,
  ]);

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
        deliveredTodayCount={list.deliveredTodayCount}
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

function createStyles(t: AppTheme) {
  const { spacing, motion } = t;
  return StyleSheet.create({
    headerRightButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    headerRightButtonPressed: {
      opacity: motion.pressOpacitySoft,
    },
  });
}
