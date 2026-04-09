import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type DeliveryStackParamList = {
  DeliveryList: undefined;
  DeliveryDetail: { shipmentId: string };
  InternalRoute: { routeId: string };
  FlexBatchMap: { batchId: string };
};

export type DeliveryStackNav<T extends keyof DeliveryStackParamList> = NativeStackNavigationProp<
  DeliveryStackParamList,
  T
>;

export type DeliveryStackRoute<T extends keyof DeliveryStackParamList> = RouteProp<
  DeliveryStackParamList,
  T
>;
