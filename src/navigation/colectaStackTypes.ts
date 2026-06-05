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
};

export type ColectaStackNav<T extends keyof ColectaStackParamList> = NativeStackNavigationProp<
  ColectaStackParamList,
  T
>;

export type ColectaStackRoute<T extends keyof ColectaStackParamList> = RouteProp<
  ColectaStackParamList,
  T
>;
