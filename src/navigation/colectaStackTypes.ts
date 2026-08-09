import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type ColectaStackParamList = {
  ClientSelection: undefined;
  ColectaScan: {
    clientId: string;
    clientName: string;
    warehouseId: string;
    warehouseName: string;
  };
  ColectaHistory: undefined;
  PickupOrdersList: undefined;
  PickupOrderPending: { orderId: string };
  PickupOrderInProgress: { orderId: string };
  PickupStopScanning: {
    orderId: string;
    stopId: string;
    collectionId: string;
    clientId: string;
    clientName: string;
    warehouseId: string;
    warehouseName: string;
  };
  PickupOrdersHistory: undefined;
};

export type ColectaStackNav<T extends keyof ColectaStackParamList> = NativeStackNavigationProp<
  ColectaStackParamList,
  T
>;

export type ColectaStackRoute<T extends keyof ColectaStackParamList> = RouteProp<
  ColectaStackParamList,
  T
>;
