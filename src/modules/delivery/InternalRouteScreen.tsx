import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';

import { InternalRouteContent } from './InternalRouteContent';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'InternalRoute'>;

export function InternalRouteScreen({ route }: Props) {
  return <InternalRouteContent routeId={route.params.routeId} />;
}
